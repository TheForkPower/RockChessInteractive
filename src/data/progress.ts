import type { Card } from "../domain/cards";
import type { Outcome, Tally } from "../domain/review";
import { applyGrade, RATING, type Grade, type Schedule } from "../domain/scheduling";
import { DEFAULT_SETTINGS, normaliseSettings, type Settings } from "../domain/settings";
import type { Timing } from "../domain/timing";
import { db, type ReviewEntry } from "./db";
import { newId } from "./repo";

// --------------------------------------------------------------- settings

const SETTINGS_KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const saved = await db.meta.get(SETTINGS_KEY);
  return normaliseSettings(saved?.value);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return db.transaction("rw", db.meta, async () => {
    const saved = await db.meta.get(SETTINGS_KEY);
    const next = normaliseSettings({ ...DEFAULT_SETTINGS, ...(saved?.value as object | undefined), ...patch });
    await db.meta.put({ key: SETTINGS_KEY, value: next });
    return next;
  });
}

// ----------------------------------------------------------------- queues

/**
 * How many never-seen cards one session brings in, until daily limits arrive in
 * milestone 5.
 */
export const NEW_PER_SESSION = 10;

export type Queue = {
  /** Cards whose time has come, the longest overdue first. */
  due: Card[];
  /** Cards that have never been graded, in the order they were made. */
  fresh: Card[];
  /** The saved schedule for each due card. */
  schedules: Record<string, Schedule>;
  /** Every card in the deck. */
  total: number;
  /** When the soonest card that isn't due yet comes back, or null if there is none. */
  nextDue: number | null;
};

export async function getQueue(deckId: string, now = Date.now()): Promise<Queue> {
  const cards = await db.cards.where("deckId").equals(deckId).toArray();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const schedules = await db.schedules.where("deckId").equals(deckId).toArray();
  const scheduled = new Set(schedules.map((item) => item.cardId));
  const dueSchedules = schedules.filter((item) => item.due <= now && byId.has(item.cardId)).sort((a, b) => a.due - b.due);
  const deck = await db.decks.get(deckId);
  const fresh = cards.filter((card) => !scheduled.has(card.id)).sort((a, b) => a.createdAt - b.createdAt || (a.sourcePly ?? 0) - (b.sourcePly ?? 0));
  // The Difficult moves deck brings the cards that give you the most trouble first.
  if (deck?.theme === "difficult") fresh.sort((a, b) => (b.struggles ?? 0) - (a.struggles ?? 0) || b.updatedAt - a.updatedAt);
  const later = schedules.filter((item) => item.due > now && byId.has(item.cardId)).map((item) => item.due);
  return {
    total: cards.length,
    nextDue: later.length > 0 ? Math.min(...later) : null,
    due: dueSchedules.map((item) => byId.get(item.cardId) as Card),
    fresh,
    schedules: Object.fromEntries(dueSchedules.map((item) => [item.cardId, item])),
  };
}

// ---------------------------------------------------------------- history

export async function getSchedule(cardId: string): Promise<Schedule | undefined> {
  return db.schedules.get(cardId);
}

export async function listSchedules(deckId: string): Promise<Record<string, Schedule>> {
  const items = await db.schedules.where("deckId").equals(deckId).toArray();
  return Object.fromEntries(items.map((item) => [item.cardId, item]));
}

/** Newest first. */
export async function listReviews(cardId: string): Promise<ReviewEntry[]> {
  const items = await db.reviews.where("cardId").equals(cardId).toArray();
  return items.sort((a, b) => b.reviewedAt - a.reviewedAt);
}

/**
 * How long you usually take per move on cards you get right first time, for the
 * time-based suggestion. Only timings that look trustworthy are used.
 */
export async function recentMoveTimes(limit = 60): Promise<number[]> {
  const items = await db.reviews.orderBy("reviewedAt").reverse().filter((item) => item.outcome === "first-try" && item.timing.reliable).limit(limit).toArray();
  return items.map((item) => item.timing.activeMs / Math.max(1, item.playerMoves));
}

/** Makes the card new again and removes its history. */
export async function resetProgress(cardId: string): Promise<void> {
  await db.transaction("rw", db.schedules, db.reviews, async () => {
    await db.schedules.delete(cardId);
    await db.reviews.where("cardId").equals(cardId).delete();
  });
}

export type GradeInput = {
  card: Card;
  grade: Grade;
  suggested: Grade;
  nudged: boolean;
  outcome: Outcome;
  tally: Tally;
  playerMoves: number;
  timing: Timing;
  desiredRetention: number;
  now?: number;
};

/** Saves a grade: the card's new schedule and a line in its history, together. */
export async function recordReview(input: GradeInput): Promise<Schedule> {
  const now = input.now ?? Date.now();
  return db.transaction("rw", db.schedules, db.reviews, async () => {
    const current = (await db.schedules.get(input.card.id)) ?? null;
    const applied = applyGrade(current, input.grade, now, input.desiredRetention);
    const schedule: Schedule = { cardId: input.card.id, deckId: input.card.deckId, ...applied.memory };
    await db.schedules.put(schedule);
    await db.reviews.add({
      id: newId(),
      cardId: input.card.id,
      deckId: input.card.deckId,
      reviewedAt: now,
      rating: RATING[input.grade],
      suggested: RATING[input.suggested],
      nudged: input.nudged,
      outcome: input.outcome,
      mistakes: input.tally.mistakes,
      hintUsed: input.tally.hintUsed,
      revealed: input.tally.revealed,
      playerMoves: input.playerMoves,
      timing: {
        activeMs: Math.round(input.timing.activeMs),
        idleMs: Math.round(input.timing.idleMs),
        hiddenMs: Math.round(input.timing.hiddenMs),
        elapsedMs: Math.round(input.timing.elapsedMs),
        firstMoveMs: input.timing.firstMoveActiveMs === null ? null : Math.round(input.timing.firstMoveActiveMs),
        flags: input.timing.flags,
        reliable: input.timing.reliable,
      },
      before: applied.before,
      after: {
        state: schedule.state,
        due: schedule.due,
        stability: schedule.stability,
        difficulty: schedule.difficulty,
        scheduledDays: schedule.scheduledDays,
      },
      elapsedDays: applied.elapsedDays,
      desiredRetention: input.desiredRetention,
    });
    return schedule;
  });
}
