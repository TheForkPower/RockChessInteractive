import Dexie, { type EntityTable } from "dexie";
import type { Card } from "../domain/cards";

export type Deck = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

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

  constructor(name = "rockchess") {
    super(name);
    this.version(1).stores({
      decks: "id, name, updatedAt",
      cards: "id, deckId, updatedAt, *tags",
      sources: "id",
    });
  }
}

export const db = new RockChessDb();
