import { beforeEach, describe, expect, it } from "vitest";
import { buildDeckCards } from "../domain/cards";
import { START_FEN } from "../domain/fen";
import { parseMovetext } from "../domain/pgn";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { BACKUP_FORMAT, backupFileName, exportBackup, importBackup, problemCount, readBackup, type Backup } from "./backup";
import { db } from "./db";
import { getSettings, recordReview, saveSettings } from "./progress";
import { addCards, createDeck, listCards } from "./repo";

async function deck(name: string, text = "1. e4 e5 2. Nf3 Nc6", source?: { title: string; pgn: string; headers: Record<string, string> }) {
  const made = await createDeck(name);
  if (!made.ok) throw new Error(made.error);
  const parsed = parseMovetext(text, START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const built = buildDeckCards(parsed.tree, { side: "w", shape: "moves", context: "rest" });
  if (!built.ok) throw new Error(built.error);
  await addCards(made.deck.id, built.drafts, source);
  return { id: made.deck.id, cards: await listCards(made.deck.id) };
}

async function graded(card: Awaited<ReturnType<typeof listCards>>[number], now = 1_000_000) {
  await recordReview({
    card,
    grade: "good",
    suggested: "good",
    nudged: false,
    outcome: "first-try",
    tally: { mistakes: 0, hintUsed: false, revealed: false, played: 1 },
    playerMoves: 1,
    timing: { shownAt: 0, firstMoveAt: 1, completedAt: 2, elapsedMs: 2, activeMs: 2, idleMs: 0, hiddenMs: 0, firstMoveActiveMs: 1, flags: [], reliable: true },
    desiredRetention: 0.9,
    now,
  });
}

const roundTrip = (backup: Backup) => {
  const result = readBackup(JSON.stringify(backup));
  if (!result.ok) throw new Error(result.error);
  return result;
};

const wipe = async () => {
  await db.delete();
  await db.open();
};

beforeEach(wipe);

describe("exporting", () => {
  it("writes everything, with the app and format named", async () => {
    const a = await deck("Open", "1. e4 e5 2. Nf3", { title: "Game", pgn: "1. e4 e5 2. Nf3", headers: { Event: "x" } });
    await graded(a.cards[0]);
    await saveSettings({ grading: "smart" });
    const backup = await exportBackup(undefined, new Date("2026-11-21T10:00:00Z"));
    expect(backup).toMatchObject({ app: "rockchess", format: BACKUP_FORMAT, scope: "all", exportedAt: "2026-11-21T10:00:00.000Z" });
    expect(backup.data.decks).toHaveLength(1);
    expect(backup.data.cards).toHaveLength(2);
    expect(backup.data.sources).toHaveLength(1);
    expect(backup.data.schedules).toHaveLength(1);
    expect(backup.data.reviews).toHaveLength(1);
    expect(backup.data.meta.find((item) => item.key === "settings")).toBeTruthy();
    expect(backupFileName(backup)).toBe("rockchess-backup-2026-11-21.json");
  });

  it("writes one deck with only its own cards, progress and sources, and no settings", async () => {
    const a = await deck("Ruy Lopez!", "1. e4 e5 2. Nf3", { title: "A", pgn: "1. e4 e5 2. Nf3", headers: {} });
    const b = await deck("Other", "1. d4 d5 2. c4");
    await graded(a.cards[0]);
    await graded(b.cards[0]);
    const backup = await exportBackup(a.id, new Date("2026-11-21T10:00:00Z"));
    expect(backup.scope).toBe("deck");
    expect(backup.data.decks.map((item) => item.name)).toEqual(["Ruy Lopez!"]);
    expect(backup.data.cards.every((card) => card.deckId === a.id)).toBe(true);
    expect(backup.data.schedules).toHaveLength(1);
    expect(backup.data.reviews).toHaveLength(1);
    expect(backup.data.sources).toHaveLength(1);
    expect(backup.data.meta).toEqual([]);
    expect(backupFileName(backup)).toBe("rockchess-deck-ruy-lopez-2026-11-21.json");
  });

  it("refuses a deck that is gone", async () => {
    await expect(exportBackup("missing")).rejects.toThrow(/no longer exists/);
  });
});

describe("reading a file", () => {
  it("accepts what it wrote, unchanged", async () => {
    const a = await deck("Open");
    await graded(a.cards[0]);
    const backup = await exportBackup();
    const result = roundTrip(backup);
    expect(problemCount(result.problems)).toBe(0);
    expect(result.backup.data).toEqual(backup.data);
  });

  it("refuses text that isn't JSON, another app's JSON, and a missing format", () => {
    expect(readBackup("not json")).toMatchObject({ ok: false, error: expect.stringContaining("isn't a RockChess backup") });
    expect(readBackup("[]")).toMatchObject({ ok: false, error: expect.stringContaining("isn't a RockChess backup") });
    expect(readBackup(JSON.stringify({ app: "anki", format: 1 }))).toMatchObject({ ok: false });
    expect(readBackup(JSON.stringify({ app: "rockchess", data: {} }))).toMatchObject({ ok: false, error: expect.stringContaining("format number") });
  });

  it("refuses a newer format and says to update", () => {
    const result = readBackup(JSON.stringify({ app: "rockchess", format: BACKUP_FORMAT + 1, data: { decks: [], cards: [] } }));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("newer version") });
  });

  it("refuses a file with no decks or cards lists", () => {
    expect(readBackup(JSON.stringify({ app: "rockchess", format: 1, data: { decks: [] } }))).toMatchObject({ ok: false, error: expect.stringContaining("missing") });
  });

  it("leaves out records it can't use and counts them", async () => {
    const a = await deck("Open");
    await graded(a.cards[0]);
    const backup = await exportBackup();
    const broken = structuredClone(backup) as unknown as { data: Record<string, Record<string, unknown>[]> };
    broken.data.decks.push({ id: "x", name: "  " }, { name: "no id" });
    broken.data.cards.push(
      { ...broken.data.cards[0], id: "bad-fen", fen: "nonsense" },
      { ...broken.data.cards[0], id: "bad-answer", answer: [{ from: "a1", to: "a8", san: "Ra8" }] },
      { ...broken.data.cards[0], id: "bad-deck", deckId: "gone" },
      { ...broken.data.cards[0], id: "bad-kind", kind: "other" },
    );
    broken.data.schedules.push({ ...broken.data.schedules[0], cardId: "gone" });
    broken.data.reviews.push({ ...broken.data.reviews[0], id: "r2", cardId: "gone" }, { id: "r3" });
    const result = readBackup(JSON.stringify(broken));
    if (!result.ok) throw new Error(result.error);
    expect(result.problems).toMatchObject({ decks: 2, cards: 4, schedules: 1, reviews: 2 });
    expect(result.backup.data.decks).toHaveLength(1);
    expect(result.backup.data.cards).toHaveLength(2);
    expect(result.backup.data.reviews).toHaveLength(1);
  });

  it("keeps a card whose saved line can't be read, without the line", async () => {
    const a = await deck("Open");
    const backup = await exportBackup();
    backup.data.cards[0] = { ...backup.data.cards[0], continuation: "1. Qh7 zzz" };
    const result = roundTrip(backup);
    expect(result.problems.adjusted).toBe(1);
    expect(result.backup.data.cards[0].continuation).toBe("");
    expect(result.backup.data.cards).toHaveLength(a.cards.length);
  });

  it("keeps the first of a repeated id, and drops progress for cards that aren't there", async () => {
    await deck("Open");
    const backup = await exportBackup();
    backup.data.decks.push({ ...backup.data.decks[0], name: "Copy" });
    backup.data.cards.push({ ...backup.data.cards[0] });
    const result = roundTrip(backup);
    expect(result.backup.data.decks).toHaveLength(1);
    expect(result.backup.data.cards).toHaveLength(backup.data.cards.length - 1);
  });

  it("repairs settings it finds, and accepts a file with no progress at all", async () => {
    await deck("Open");
    const backup = await exportBackup();
    backup.data.meta = [{ key: "settings", value: { grading: "weird", desiredRetention: 7 } }];
    const raw = JSON.parse(JSON.stringify(backup));
    delete raw.data.schedules;
    delete raw.data.reviews;
    delete raw.data.sources;
    const result = readBackup(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.error);
    expect(result.backup.data.meta[0].value).toEqual(expect.objectContaining({ grading: "manual" }));
    expect(result.backup.data.schedules).toEqual([]);
  });
});

describe("restoring over everything", () => {
  it("brings back decks, cards, progress and settings, and clears what was there", async () => {
    const a = await deck("Open");
    await graded(a.cards[0]);
    await saveSettings({ grading: "smart" });
    const backup = roundTrip(await exportBackup()).backup;

    await wipe();
    const stray = await deck("Stray", "1. d4 d5 2. c4");
    await graded(stray.cards[0]);
    const summary = await importBackup(backup, "replace");

    expect(summary).toMatchObject({ mode: "replace", decksAdded: 1, cardsAdded: 2, reviewsAdded: 1 });
    expect((await db.decks.toArray()).map((item) => item.name)).toEqual(["Open"]);
    expect(await db.cards.count()).toBe(2);
    expect(await db.schedules.count()).toBe(1);
    expect(await db.reviews.count()).toBe(1);
    expect((await getSettings()).grading).toBe("smart");
  });

  it("is refused for a single deck, and changes nothing", async () => {
    const a = await deck("Open");
    const one = roundTrip(await exportBackup(a.id)).backup;
    await expect(importBackup(one, "replace")).rejects.toThrow(/everything/);
    expect(await db.cards.count()).toBe(2);
  });
});

describe("adding to what is already here", () => {
  it("adds a deck and its cards and progress to an empty browser, keeping local settings", async () => {
    const a = await deck("Open");
    await graded(a.cards[0]);
    const one = roundTrip(await exportBackup(a.id)).backup;
    await wipe();
    await saveSettings({ grading: "smart" });

    const summary = await importBackup(one, "merge");
    expect(summary).toMatchObject({ decksAdded: 1, decksMerged: 0, cardsAdded: 2, cardsSkipped: 0, reviewsAdded: 1 });
    expect(await db.schedules.count()).toBe(1);
    expect((await getSettings()).grading).toBe("smart");
  });

  it("does nothing the second time, and doesn't double the cards", async () => {
    const a = await deck("Open");
    await graded(a.cards[0]);
    const backup = roundTrip(await exportBackup()).backup;
    const summary = await importBackup(backup, "merge");
    expect(summary).toMatchObject({ decksAdded: 0, decksMerged: 1, cardsAdded: 0, cardsSkipped: 2, reviewsAdded: 0 });
    expect(await db.cards.count()).toBe(2);
    expect(await db.reviews.count()).toBe(1);
  });

  it("names a clashing deck 'imported' rather than mixing it into another", async () => {
    const a = await deck("Open");
    const one = roundTrip(await exportBackup(a.id)).backup;
    await wipe();
    await deck("Open", "1. d4 d5 2. c4");
    await importBackup(one, "merge");
    const names = (await db.decks.toArray()).map((item) => item.name).sort();
    expect(names).toEqual(["Open", "Open (imported)"]);
    await importBackup({ ...one, data: { ...one.data, decks: one.data.decks.map((item) => ({ ...item, id: "other" })), cards: one.data.cards.map((card) => ({ ...card, id: `${card.id}-x`, deckId: "other" })) } }, "merge");
    expect((await db.decks.toArray()).map((item) => item.name)).toContain("Open (imported 2)");
  });

  it("skips a card already here by position and answer, and keeps its own progress", async () => {
    const a = await deck("Open");
    await graded(a.cards[0], 5_000_000);
    const mine = await db.schedules.get(a.cards[0].id);
    const backup = roundTrip(await exportBackup()).backup;
    // The same deck as someone else made it: different ids, a different review.
    const theirs: Backup = {
      ...backup,
      data: {
        ...backup.data,
        cards: backup.data.cards.map((card) => ({ ...card, id: `their-${card.id}` })),
        schedules: backup.data.schedules.map((item) => ({ ...item, cardId: `their-${item.cardId}`, due: 1 })),
        reviews: backup.data.reviews.map((item) => ({ ...item, id: "their-review", cardId: `their-${item.cardId}` })),
      },
    };
    const summary = await importBackup(theirs, "merge");
    expect(summary).toMatchObject({ cardsAdded: 0, cardsSkipped: 2, reviewsAdded: 0 });
    expect(await db.schedules.get(a.cards[0].id)).toEqual(mine);
  });

  it("gives a card that is here but has no progress the progress from the file", async () => {
    const a = await deck("Open");
    const withProgress = await exportBackup();
    withProgress.data.schedules.push({
      cardId: a.cards[0].id,
      deckId: a.id,
      due: 9,
      stability: 3,
      difficulty: 4,
      scheduledDays: 5,
      learningSteps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      lastReview: 1,
    });
    const summary = await importBackup(roundTrip(withProgress).backup, "merge");
    expect(summary.cardsSkipped).toBe(2);
    expect((await db.schedules.get(a.cards[0].id))?.stability).toBe(3);
  });

  it("puts a file's cards into the starter deck that is already here", async () => {
    await db.decks.add({ id: "mine", name: "Welcome", theme: "tutorial", createdAt: 0, updatedAt: 0 });
    const other = await deck("Open");
    const backup = roundTrip(await exportBackup()).backup;
    backup.data.decks.push({ id: "theirs", name: "Welcome", theme: "tutorial", createdAt: 0, updatedAt: 0 });
    backup.data.cards.push({ ...backup.data.cards[0], id: "extra", deckId: "theirs", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", answer: [{ from: "d2", to: "d4", san: "d4" }] });
    await importBackup(backup, "merge");
    expect((await db.cards.get("extra"))?.deckId).toBe("mine");
    expect((await db.decks.toArray()).filter((item) => item.theme === "tutorial")).toHaveLength(1);
    expect(other.id).toBeTruthy();
  });

  it("keeps flags and settings already here, and adds flags it lacks", async () => {
    await deck("Open");
    const backup = roundTrip(await exportBackup()).backup;
    await saveSettings({ desiredRetention: 0.8 });
    backup.data.meta = [
      { key: "settings", value: { ...DEFAULT_SETTINGS, desiredRetention: 0.95 } },
      { key: "tutorialDeckAdded", value: true },
    ];
    await importBackup(backup, "merge");
    expect((await getSettings()).desiredRetention).toBe(0.8);
    expect((await db.meta.get("tutorialDeckAdded"))?.value).toBe(true);
  });
});
