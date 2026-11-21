import Dexie, { type EntityTable } from "dexie";
import type { Card } from "../domain/cards";
import type { Outcome } from "../domain/review";
import type { Schedule, ScheduleState } from "../domain/scheduling";
import type { TimingFlag } from "../domain/timing";

export type Deck = {
  id: string;
  name: string;
  /** A line or two about the deck, shown on its banner. */
  description?: string;
  /** An id from the deck colour palette. Decks without one get a colour from their id. */
  color?: string;
  /** "tutorial" marks the starter deck that comes with the app. "difficult" marks the deck that fills itself with the cards you struggle with. */
  theme?: "tutorial" | "difficult";
  createdAt: number;
  updatedAt: number;
};

/** Small flags the app keeps about itself, such as "the starter deck has been added". */
export type MetaEntry = { key: string; value: unknown };

/** A PGN a card was made from, kept so the original text isn't lost. */
export type Source = {
  id: string;
  title: string;
  pgn: string;
  headers: Record<string, string>;
  createdAt: number;
};

/**
 * One graded review. Timing is kept in its own block, apart from the rating:
 * `rating` is exactly what the person pressed, and FSRS only ever saw that.
 */
export type ReviewEntry = {
  id: string;
  cardId: string;
  deckId: string;
  reviewedAt: number;
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. What was pressed, and what FSRS was given. */
  rating: 1 | 2 | 3 | 4;
  /** The grade the buttons suggested. */
  suggested: 1 | 2 | 3 | 4;
  /** True when response time lifted the suggestion. */
  nudged: boolean;
  outcome: Outcome;
  /** "learn" for the first review of a card, when it was introduced and graded automatically. Older lines have none. */
  phase?: "learn" | "review";
  mistakes: number;
  hintUsed: boolean;
  revealed: boolean;
  /** How many moves the person had to find. */
  playerMoves: number;
  timing: {
    activeMs: number;
    idleMs: number;
    hiddenMs: number;
    elapsedMs: number;
    firstMoveMs: number | null;
    flags: TimingFlag[];
    reliable: boolean;
  };
  before: { state: ScheduleState; due: number | null; stability: number | null; difficulty: number | null };
  after: { state: ScheduleState; due: number; stability: number; difficulty: number; scheduledDays: number };
  /** Days since the card was last reviewed. */
  elapsedDays: number;
  desiredRetention: number;
};

/**
 * All saved data lives in the browser's IndexedDB. New tables arrive as new
 * versions, so what is already saved is kept.
 */
export class RockChessDb extends Dexie {
  decks!: EntityTable<Deck, "id">;
  cards!: EntityTable<Card, "id">;
  sources!: EntityTable<Source, "id">;
  meta!: EntityTable<MetaEntry, "key">;
  schedules!: EntityTable<Schedule, "cardId">;
  reviews!: EntityTable<ReviewEntry, "id">;

  constructor(name = "rockchess") {
    super(name);
    this.version(1).stores({
      decks: "id, name, updatedAt",
      cards: "id, deckId, updatedAt, *tags",
      sources: "id",
    });
    this.version(2).stores({
      meta: "key",
    });
    this.version(3).stores({
      schedules: "cardId, deckId, due",
      reviews: "id, cardId, deckId, reviewedAt",
    });
  }
}

export const db = new RockChessDb();
