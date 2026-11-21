import { beforeEach, describe, expect, it } from "vitest";
import { buildDeckCards, type Card } from "../domain/cards";
import { START_FEN } from "../domain/fen";
import { parseMovetext } from "../domain/pgn";
import { DEFAULT_SETTINGS } from "../domain/settings";
import type { Timing } from "../domain/timing";
import { db } from "./db";
import { getQueue, getSettings, listReviews, recentMoveTimes, recordReview, resetProgress, saveSettings, type GradeInput } from "./progress";
import { addCards, createDeck, deleteCard, deleteDeck, listDecks, updateCard } from "./repo";

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
    await db.meta.put({ key: "settings", value: { desiredRetention: 7, timeSignal: "yes", idleSeconds: -3 } });
    expect(await getSettings()).toEqual({ desiredRetention: 0.95, timeSignal: true, idleSeconds: 15 });
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
