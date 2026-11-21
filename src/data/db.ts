import Dexie, { type EntityTable } from "dexie";
import type { Card } from "../domain/cards";

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
 * All saved data lives in the browser's IndexedDB. Later milestones add
 * tables (review history, schedules, settings) as new versions.
 */
export class RockChessDb extends Dexie {
  decks!: EntityTable<Deck, "id">;
  cards!: EntityTable<Card, "id">;
  sources!: EntityTable<Source, "id">;
  meta!: EntityTable<MetaEntry, "key">;

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
  }
}

export const db = new RockChessDb();
