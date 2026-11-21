import { beforeEach, describe, expect, it } from "vitest";
import { buildDeckCards, type Card } from "../domain/cards";
import { START_FEN } from "../domain/fen";
import { parseMovetext } from "../domain/pgn";
import { DEFAULT_SETTINGS } from "../domain/settings";
import type { Timing } from "../domain/timing";
import { db } from "./db";
import { getOverview, getQueue, getSettings, introducedToday, listReviews, recentMoveTimes, recordReview, resetProgress, saveSettings, type GradeInput } from "./progress";
import { addCards, createDeck, deleteCard, deleteDeck, listDecks, updateCard } from "./repo";
import { markDifficult } from "./difficult";

const DAY = 86_400_000;
const T0 = new Date(2026, 5, 10, 12).getTime();

async function deckWithCards(text = "1. e4 e5 2. Nf3 Nc6"): Promise<{ deckId: string; cards: Card[] }> {
  const made = await createDeck("Open");
  if (!made.ok) throw new Error(made.error);
  const parsed = parseMovetext(text, START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const built = buildDeckCards(parsed.tree, { side: "w", shape: "moves", context: "rest" });
  if (!built.ok) throw new Error(built.error);
  await addCards(made.deck.id, built.drafts);
  return { deckId: made.deck.id, cards: await db.cards.where("deckId").equals(made.deck.id).toArray() };
}

const timing = (overrides: Partial<Timing> = {}): Timing => ({
  shownAt: 0,
  firstMoveAt: 2000,
  completedAt: 3000,
  elapsedMs: 3000,
  activeMs: 3000,
  idleMs: 0,
  hiddenMs: 0,
  firstMoveActiveMs: 2000,
  flags: [],
  reliable: true,
  ...overrides,
});

const grade = (card: Card, overrides: Partial<GradeInput> = {}): GradeInput => ({
  card,
  grade: "good",
  suggested: "good",
  nudged: false,
  outcome: "first-try",
  tally: { mistakes: 0, hintUsed: false, revealed: false, played: 1 },
  playerMoves: 1,
  timing: timing(),
  desiredRetention: 0.9,
  now: T0,
  ...overrides,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("settings", () => {
  it("starts with the defaults", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("saves a change and keeps the rest", async () => {
    await saveSettings({ desiredRetention: 0.95 });
    await saveSettings({ timeSignal: false });
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, desiredRetention: 0.95, timeSignal: false });
  });

  it("repairs saved values that make no sense", async () => {
    await db.meta.put({ key: "settings", value: { grading: "clever", desiredRetention: 7, timeSignal: "yes", idleSeconds: -3, newPerDay: 9999 } });
    expect(await getSettings()).toEqual({ grading: "manual", desiredRetention: 0.95, timeSignal: true, idleSeconds: 15, newPerDay: 50 });
    await db.meta.put({ key: "settings", value: { grading: "smart" } });
    expect((await getSettings()).grading).toBe("smart");
  });
});

describe("the queue", () => {
  it("treats a card nobody has graded as new", async () => {
    const { deckId, cards } = await deckWithCards();
    const queue = await getQueue(deckId, T0);
    expect(queue.fresh.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
    expect(queue.due).toEqual([]);
    expect(await listDecks(T0)).toMatchObject([{ cardCount: 2, dueCount: 0, newCount: 2 }]);
  });

  it("a graded card leaves the new pile and comes back when due", async () => {
    const { deckId, cards } = await deckWithCards();
    const schedule = await recordReview(grade(cards[0]));
    expect(schedule.due).toBeGreaterThan(T0);

    const today = await getQueue(deckId, T0 + 1000);
    expect(today.fresh).toHaveLength(1);
    expect(today.due).toEqual([]);

    const later = await getQueue(deckId, schedule.due + 1000);
    expect(later.due.map((card) => card.id)).toEqual([cards[0].id]);
    expect(later.schedules[cards[0].id].due).toBe(schedule.due);
    expect(await listDecks(schedule.due + 1000)).toMatchObject([{ dueCount: 1, newCount: 1 }]);
  });

  it("keeps cards due at the same moment in the order they were made", async () => {
    const { deckId, cards } = await deckWithCards("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6");
    expect(cards.length).toBeGreaterThan(2);
    const ordered = [...cards].sort((a, b) => a.createdAt - b.createdAt || (a.sourcePly ?? 0) - (b.sourcePly ?? 0));
    // Grade them in a scrambled order, all at the same time.
    for (const card of [...ordered].reverse()) await recordReview(grade(card, { now: T0 }));
    const queue = await getQueue(deckId, T0 + 60 * DAY);
    expect(queue.due.map((card) => card.id)).toEqual(ordered.map((card) => card.id));
  });

  it("puts the longest overdue card first", async () => {
    const { deckId, cards } = await deckWithCards();
    const a = await recordReview(grade(cards[0], { now: T0 }));
    const b = await recordReview(grade(cards[1], { now: T0 - 20 * DAY }));
    const queue = await getQueue(deckId, Math.max(a.due, b.due) + DAY);
    expect(queue.due.map((card) => card.id)).toEqual([cards[1].id, cards[0].id]);
  });
});

describe("recording a review", () => {
  it("saves the schedule and a history line together", async () => {
    const { cards } = await deckWithCards();
    await recordReview(grade(cards[0], { grade: "easy", suggested: "good", nudged: false }));
    expect(await db.schedules.count()).toBe(1);
    const [entry] = await listReviews(cards[0].id);
    expect(entry).toMatchObject({
      cardId: cards[0].id,
      rating: 4,
      suggested: 3,
      outcome: "first-try",
      desiredRetention: 0.9,
      before: { state: 0, due: null },
    });
    expect(entry.after.due).toBe((await db.schedules.get(cards[0].id))?.due);
  });

  it("takes back an earlier grade when it is replaced, and starts again from the schedule before it", async () => {
    const { cards } = await deckWithCards();
    const first = await recordReview(grade(cards[0], { now: T0 }));
    const before = await db.schedules.get(cards[0].id);
    await recordReview(grade(cards[0], { now: T0 + DAY, reviewId: "mine" }));
    const replaced = await recordReview(
      grade(cards[0], { now: T0 + DAY, grade: "again", replaces: { reviewId: "mine", schedule: before ?? null } }),
    );
    expect(await db.reviews.get("mine")).toBeUndefined();
    expect(await db.reviews.where("cardId").equals(cards[0].id).count()).toBe(2);
    expect(replaced.reps).toBe(first.reps + 1);
    expect(replaced.lapses).toBe(first.lapses + 1);
  });

  it("keeps the rating the person pressed and the timing apart", async () => {
    const { cards } = await deckWithCards();
    await recordReview(
      grade(cards[0], {
        grade: "hard",
        suggested: "easy",
        nudged: true,
        timing: timing({ activeMs: 61_234.6, idleMs: 70_000, hiddenMs: 6000, flags: ["idle", "hidden"], reliable: false }),
      }),
    );
    const [entry] = await listReviews(cards[0].id);
    expect(entry.rating).toBe(2);
    expect(entry.suggested).toBe(4);
    expect(entry.nudged).toBe(true);
    expect(entry.timing).toEqual({
      activeMs: 61_235,
      idleMs: 70_000,
      hiddenMs: 6000,
      elapsedMs: 3000,
      firstMoveMs: 2000,
      flags: ["idle", "hidden"],
      reliable: false,
    });
  });

  it("the second review builds on the first", async () => {
    const { cards } = await deckWithCards();
    const first = await recordReview(grade(cards[0]));
    const second = await recordReview(grade(cards[0], { now: first.due }));
    expect(second.reps).toBe(2);
    expect(second.scheduledDays).toBeGreaterThan(first.scheduledDays);
    const [latest, earlier] = await listReviews(cards[0].id);
    expect(latest.before.due).toBe(first.due);
    expect(latest.elapsedDays).toBeGreaterThan(0);
    expect(earlier.before.due).toBeNull();
  });

  it("survives a reload: the schedule is in the database, not in memory", async () => {
    const { deckId, cards } = await deckWithCards();
    const saved = await recordReview(grade(cards[0]));
    db.close();
    await db.open();
    expect(await db.schedules.get(cards[0].id)).toEqual(saved);
    expect((await getQueue(deckId, saved.due)).due).toHaveLength(1);
  });
});

describe("how long you usually take", () => {
  it("counts only trustworthy first-try timings, per move", async () => {
    const { cards } = await deckWithCards();
    await recordReview(grade(cards[0], { timing: timing({ activeMs: 8000 }), playerMoves: 2, now: T0 }));
    await recordReview(grade(cards[1], { timing: timing({ activeMs: 2000, reliable: false, flags: ["hidden"] }), now: T0 + 1 }));
    await recordReview(grade(cards[1], { outcome: "with-help", timing: timing({ activeMs: 9000 }), now: T0 + 2 }));
    expect(await recentMoveTimes()).toEqual([4000]);
  });
});

describe("cleaning up", () => {
  it("resetting makes a card new and drops its history", async () => {
    const { deckId, cards } = await deckWithCards();
    await recordReview(grade(cards[0]));
    await resetProgress(cards[0].id);
    expect(await db.schedules.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
    expect((await getQueue(deckId, T0)).fresh).toHaveLength(2);
  });

  it("deleting a card deletes its schedule and history", async () => {
    const { cards } = await deckWithCards();
    await recordReview(grade(cards[0]));
    await deleteCard(cards[0].id);
    expect(await db.schedules.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });

  it("deleting a deck deletes the schedules and history of its cards", async () => {
    const { deckId, cards } = await deckWithCards();
    await recordReview(grade(cards[0]));
    await recordReview(grade(cards[1]));
    await deleteDeck(deckId);
    expect(await db.schedules.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });

  it("moving a card to another deck takes its progress along", async () => {
    const { cards } = await deckWithCards();
    const other = await createDeck("Other");
    if (!other.ok) throw new Error(other.error);
    await recordReview(grade(cards[0]));
    await updateCard({ ...cards[0], deckId: other.deck.id });
    expect((await db.schedules.get(cards[0].id))?.deckId).toBe(other.deck.id);
    expect((await listReviews(cards[0].id))[0].deckId).toBe(other.deck.id);
  });
});

describe("the daily limit", () => {
  const cardsFor = async (text: string, name: string) => {
    const made = await createDeck(name);
    if (!made.ok) throw new Error(made.error);
    const parsed = parseMovetext(text, START_FEN);
    if (!parsed.ok) throw new Error(parsed.error);
    const built = buildDeckCards(parsed.tree, { side: "w", shape: "moves", context: "rest" });
    if (!built.ok) throw new Error(built.error);
    await addCards(made.deck.id, built.drafts);
    return { deckId: made.deck.id, cards: await db.cards.where("deckId").equals(made.deck.id).toArray() };
  };

  it("allows the limit's worth of new cards, and fewer as cards are introduced", async () => {
    await saveSettings({ newPerDay: 5 });
    const { deckId, cards } = await cardsFor("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6", "Long");
    expect(cards.length).toBeGreaterThan(5);
    expect(await getQueue(deckId, T0)).toMatchObject({ allowance: 5, limit: 5, introduced: 0 });
    await recordReview(grade(cards[0], { now: T0 }));
    await recordReview(grade(cards[1], { now: T0 + 1 }));
    expect(await getQueue(deckId, T0 + 2)).toMatchObject({ allowance: 3, introduced: 2 });
    expect((await getQueue(deckId, T0 + 2)).fresh).toHaveLength(cards.length - 2);
  });

  it("counts a card once, on the day it was first graded, and starts again tomorrow", async () => {
    const { cards } = await cardsFor("1. e4 e5 2. Nf3", "Open");
    const first = await recordReview(grade(cards[0], { now: T0 }));
    await recordReview(grade(cards[0], { now: first.due }));
    expect(await introducedToday(T0 + 1000)).toBe(1);
    expect(await introducedToday(first.due + 1000)).toBe(0); // reviewing it again later isn't introducing it
    expect(await introducedToday(T0 + 2 * DAY)).toBe(0);
  });

  it("never lets the allowance go below zero", async () => {
    await saveSettings({ newPerDay: 5 });
    const { cards } = await cardsFor("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6", "Long");
    for (let i = 0; i < 7; i += 1) await recordReview(grade(cards[i], { now: T0 + i }));
    expect((await getQueue(null, T0 + 100)).allowance).toBe(0);
  });
});

describe("the queue over every deck", () => {
  it("lists due cards from all decks, longest overdue first, and new cards deck by deck", async () => {
    const a = await deckWithCards("1. e4 e5");
    const bMade = await createDeck("Second");
    if (!bMade.ok) throw new Error(bMade.error);
    const parsed = parseMovetext("1. d4 d5", START_FEN);
    if (!parsed.ok) throw new Error(parsed.error);
    const built = buildDeckCards(parsed.tree, { side: "w", shape: "moves", context: "rest" });
    if (!built.ok) throw new Error(built.error);
    await addCards(bMade.deck.id, built.drafts);
    const bCards = await db.cards.where("deckId").equals(bMade.deck.id).toArray();

    const untouched = await getQueue(null, T0);
    expect(untouched.fresh.map((card) => card.deckId)).toEqual([a.deckId, bMade.deck.id]);

    await recordReview(grade(a.cards[0], { now: T0 - 10 * DAY }));
    await recordReview(grade(bCards[0], { now: T0 - 40 * DAY }));
    const queue = await getQueue(null, T0 + 60 * DAY);
    expect(queue.due.map((card) => card.deckId)).toEqual([bMade.deck.id, a.deckId]);
    expect(queue.total).toBe(a.cards.length + bCards.length);
    expect(Object.keys(queue.decks)).toHaveLength(2);
  });

  it("leaves the Difficult moves deck's new cards out, and doesn't count them against the limit", async () => {
    const { deckId, cards } = await deckWithCards("1. e4 e5");
    await markDifficult(cards[0]);
    const hard = (await db.decks.toArray()).find((deck) => deck.theme === "difficult")!;
    const copy = (await db.cards.where("deckId").equals(hard.id).toArray())[0];

    const everything = await getQueue(null, T0);
    expect(everything.fresh.map((card) => card.id)).not.toContain(copy.id);
    expect(everything.fresh.map((card) => card.deckId)).toEqual(Array(cards.length).fill(deckId));

    const own = await getQueue(hard.id, T0);
    expect(own.fresh.map((card) => card.id)).toEqual([copy.id]);
    expect(own.allowance).toBe(own.fresh.length); // unlimited

    await saveSettings({ newPerDay: 5 });
    await recordReview(grade(copy, { now: T0 }));
    expect(await introducedToday(T0 + 1)).toBe(0);
  });

  it("summarises what is due and how many new cards today's limit lets in", async () => {
    await saveSettings({ newPerDay: 5 });
    const { cards } = await deckWithCards("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6");
    await recordReview(grade(cards[0], { now: T0 - 30 * DAY }));
    const overview = await getOverview(T0);
    expect(overview).toMatchObject({ due: 1, fresh: 5, newTotal: cards.length - 1, limit: 5 });
  });
});
