import type { Card } from "../domain/cards";
import type { Outcome, Tally } from "../domain/review";
import { applyGrade, RATING, type Grade, type Schedule } from "../domain/scheduling";
import { DEFAULT_SETTINGS, normaliseSettings, type Settings } from "../domain/settings";
import type { Timing } from "../domain/timing";
import { db, type Deck, type ReviewEntry } from "./db";
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

/** Midnight at the start of the day `time` falls in, in the local time zone. */
export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * The Difficult moves deck is made of copies of cards you already know, so
 * its cards aren't counted against the daily limit and don't join the combined
 * session as new cards.
 */
async function difficultDeckIds(): Promise<Set<string>> {
  const decks = await db.decks.filter((deck) => deck.theme === "difficult").toArray();
  return new Set(decks.map((deck) => deck.id));
}

/** How many cards were introduced (graded for the first time) today, apart from the Difficult moves deck. */
export async function introducedToday(now = Date.now()): Promise<number> {
  const skip = await difficultDeckIds();
  const first = await db.reviews
    .where("reviewedAt")
    .aboveOrEqual(startOfDay(now))
    .filter((entry) => entry.before.state === 0 && !skip.has(entry.deckId))
    .toArray();
  return new Set(first.map((entry) => entry.cardId)).size;
}

export type Queue = {
  /** Cards whose time has come, the longest overdue first. */
  due: Card[];
  /** Cards that have never been graded, in the order they were made, whatever today's limit is. */
  fresh: Card[];
  /** How many of those may be introduced today. */
  allowance: number;
  /** New cards introduced today, and the daily limit. */
  introduced: number;
  limit: number;
  /** The saved schedule for each due card. */
  schedules: Record<string, Schedule>;
  /** Every card in scope. */
  total: number;
  /** When the soonest card that isn't due yet comes back, or null if there is none. */
  nextDue: number | null;
  /** The decks the cards belong to. */
  decks: Record<string, Deck>;
};

/**
 * What is waiting: one deck's cards, or every deck's when no deck is given.
 * Due cards are always included. New cards are listed in full, and `allowance`
 * says how many of them today's limit lets in. The Difficult moves deck is never
 * limited, and its cards don't join the all-decks list as new.
 */
export async function getQueue(deckId: string | null, now = Date.now()): Promise<Queue> {
  const decks = await db.decks.toArray();
  const byDeck = Object.fromEntries(decks.map((deck) => [deck.id, deck]));
  const scope = deckId ? [deckId] : decks.map((deck) => deck.id);
  const cards = (await db.cards.where("deckId").anyOf(scope).toArray()).filter((card) => byDeck[card.deckId]);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const schedules = await db.schedules.where("deckId").anyOf(scope).toArray();
  const scheduled = new Set(schedules.map((item) => item.cardId));
  const dueSchedules = schedules.filter((item) => item.due <= now && byId.has(item.cardId)).sort((a, b) => a.due - b.due);
  const later = schedules.filter((item) => item.due > now && byId.has(item.cardId)).map((item) => item.due);

  const deckOrder = new Map(decks.map((deck) => [deck.id, deck.createdAt]));
  let fresh = cards.filter((card) => !scheduled.has(card.id));
  if (!deckId) fresh = fresh.filter((card) => byDeck[card.deckId].theme !== "difficult");
  fresh.sort(
    (a, b) =>
      (deckOrder.get(a.deckId) ?? 0) - (deckOrder.get(b.deckId) ?? 0) ||
      a.createdAt - b.createdAt ||
      (a.sourcePly ?? 0) - (b.sourcePly ?? 0),
  );
  // The Difficult moves deck brings the cards that give you the most trouble first.
  if (deckId && byDeck[deckId]?.theme === "difficult") {
    fresh.sort((a, b) => (b.struggles ?? 0) - (a.struggles ?? 0) || b.updatedAt - a.updatedAt);
  }

  const { newPerDay } = await getSettings();
  const introduced = await introducedToday(now);
  const unlimited = deckId !== null && byDeck[deckId]?.theme === "difficult";
  return {
    total: cards.length,
    nextDue: later.length > 0 ? Math.min(...later) : null,
    due: dueSchedules.map((item) => byId.get(item.cardId) as Card),
    fresh,
    allowance: unlimited ? fresh.length : Math.max(0, newPerDay - introduced),
    introduced,
    limit: newPerDay,
    schedules: Object.fromEntries(dueSchedules.map((item) => [item.cardId, item])),
    decks: byDeck,
  };
}

export type Overview = {
  /** Cards due now, in every deck. */
  due: number;
  /** New cards today's limit lets in. */
  fresh: number;
  /** New cards in all, whatever the limit. */
  newTotal: number;
  introduced: number;
  limit: number;
};

/** The numbers behind "Start learning & review": how much is due and how many new cards can come in today. */
export async function getOverview(now = Date.now()): Promise<Overview> {
  const queue = await getQueue(null, now);
  return {
    due: queue.due.length,
    fresh: Math.min(queue.fresh.length, queue.allowance),
    newTotal: queue.fresh.length,
    introduced: queue.introduced,
    limit: queue.limit,
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
  /** "learn" when the card is being introduced and the grade is worked out for the person. */
  phase?: "learn" | "review";
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
      phase: input.phase ?? "review",
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
