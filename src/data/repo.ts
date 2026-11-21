import type { Card, CardDraft } from "../domain/cards";
import { findColor, nextColor } from "../domain/deckColors";
import { cardStatus } from "../domain/scheduling";
import { db, type Deck, type Source } from "./db";
import { protectOnce } from "./persist";

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const STORAGE_ERROR =
  "Couldn't save to this browser. Storage may be blocked, for example in a private window.";

// ------------------------------------------------------------------ decks

export async function createDeck(name: string): Promise<Result<{ deck: Deck }>> {
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, error: "Give the deck a name." };
  const taken = await db.decks.filter((deck) => deck.name.toLowerCase() === trimmed.toLowerCase()).first();
  if (taken) return { ok: false, error: `You already have a deck called "${taken.name}". Pick it from the list instead.` };
  const now = Date.now();
  const all = await db.decks.toArray();
  const color = nextColor(all.map((item) => item.color), all.length).id;
  const deck: Deck = { id: newId(), name: trimmed, color, createdAt: now, updatedAt: now };
  await db.decks.add(deck);
  protectOnce();
  return { ok: true, deck };
}

export async function renameDeck(id: string, name: string): Promise<Result<object>> {
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, error: "Give the deck a name." };
  const taken = await db.decks
    .filter((deck) => deck.id !== id && deck.name.toLowerCase() === trimmed.toLowerCase())
    .first();
  if (taken) return { ok: false, error: `You already have a deck called "${taken.name}".` };
  await db.decks.update(id, { name: trimmed, updatedAt: Date.now() });
  return { ok: true };
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  return db.decks.get(id);
}

export async function setDeckColor(id: string, color: string): Promise<Result<object>> {
  if (!findColor(color)) return { ok: false, error: "That colour isn't one of the choices." };
  await db.decks.update(id, { color, updatedAt: Date.now() });
  return { ok: true };
}

/** Deletes a deck and every card in it. */
export async function deleteDeck(id: string): Promise<void> {
  await db.transaction("rw", [db.decks, db.cards, db.schedules, db.reviews], async () => {
    await db.cards.where("deckId").equals(id).delete();
    await db.schedules.where("deckId").equals(id).delete();
    await db.reviews.where("deckId").equals(id).delete();
    await db.decks.delete(id);
  });
}

/**
 * `dueCount` is cards whose time has come. `newCount` is cards never graded.
 * `learningCount` is graded cards whose gap is still short, and `masteredCount` those with a gap of 21 days or more.
 * New, learning and mastered add up to the card count. Due cuts across the last two.
 */
export type DeckSummary = Deck & {
  cardCount: number;
  dueCount: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
};

export async function listDecks(now = Date.now()): Promise<DeckSummary[]> {
  const decks = await db.decks.orderBy("name").toArray();
  return Promise.all(
    decks.map(async (deck) => {
      const cardIds = new Set(await db.cards.where("deckId").equals(deck.id).primaryKeys());
      const schedules = (await db.schedules.where("deckId").equals(deck.id).toArray()).filter((item) => cardIds.has(item.cardId));
      return {
        ...deck,
        cardCount: cardIds.size,
        dueCount: schedules.filter((item) => item.due <= now).length,
        newCount: cardIds.size - schedules.length,
        learningCount: schedules.filter((item) => cardStatus(item) === "learning").length,
        masteredCount: schedules.filter((item) => cardStatus(item) === "mastered").length,
      };
    }),
  );
}

// ------------------------------------------------------------------ cards

export async function listCards(deckId: string): Promise<Card[]> {
  const cards = await db.cards.where("deckId").equals(deckId).toArray();
  const deck = await db.decks.get(deckId);
  // The Difficult moves deck puts the cards that give you the most trouble first.
  if (deck?.theme === "difficult") {
    return cards.sort((a, b) => (b.struggles ?? 0) - (a.struggles ?? 0) || b.updatedAt - a.updatedAt);
  }
  return cards.sort((a, b) => a.createdAt - b.createdAt || (a.sourcePly ?? 0) - (b.sourcePly ?? 0));
}

export async function getCard(id: string): Promise<Card | undefined> {
  return db.cards.get(id);
}

export const sameCard = (a: Pick<Card, "kind" | "fen" | "answer">, b: Pick<Card, "kind" | "fen" | "answer">) =>
  a.kind === b.kind &&
  a.fen === b.fen &&
  a.answer.length === b.answer.length &&
  a.answer.every((move, index) => move.from === b.answer[index].from && move.to === b.answer[index].to && move.promotion === b.answer[index].promotion);

export type AddResult = { added: number; skipped: number; ids: string[] };

/**
 * Saves cards into a deck. A card that matches one already there (same
 * position, same kind, same answer) is skipped, so importing a line twice
 * doesn't double the deck.
 */
export async function addCards(deckId: string, drafts: CardDraft[], source?: Omit<Source, "id" | "createdAt">): Promise<AddResult> {
  return db.transaction("rw", db.decks, db.cards, db.sources, async () => {
    const existing = await db.cards.where("deckId").equals(deckId).toArray();
    const now = Date.now();
    let sourceId: string | undefined;
    if (source && drafts.length > 0) {
      sourceId = newId();
      await db.sources.add({ ...source, id: sourceId, createdAt: now });
    }

    const toAdd: Card[] = [];
    let skipped = 0;
    drafts.forEach((draft, index) => {
      const card: Card = {
        ...draft,
        id: newId(),
        deckId,
        ...(sourceId ? { sourceId } : {}),
        createdAt: now + index,
        updatedAt: now,
      };
      if ([...existing, ...toAdd].some((other) => sameCard(other, card))) skipped += 1;
      else toAdd.push(card);
    });
    if (toAdd.length > 0) await db.cards.bulkAdd(toAdd);
    if (toAdd.length === 0 && sourceId) await db.sources.delete(sourceId);
    await db.decks.update(deckId, { updatedAt: now });
    return { added: toAdd.length, skipped, ids: toAdd.map((card) => card.id) };
  }).then((result) => {
    if (result.added > 0) protectOnce();
    return result;
  });
}

export async function updateCard(card: Card): Promise<void> {
  await db.transaction("rw", [db.cards, db.decks, db.schedules, db.reviews], async () => {
    const now = Date.now();
    await db.cards.put({ ...card, updatedAt: now });
    await db.decks.update(card.deckId, { updatedAt: now });
    // A card moved to another deck takes its schedule and history with it.
    await db.schedules.where("cardId").equals(card.id).modify({ deckId: card.deckId });
    await db.reviews.where("cardId").equals(card.id).modify({ deckId: card.deckId });
  });
}

export async function deleteCard(id: string): Promise<void> {
  await db.transaction("rw", [db.cards, db.schedules, db.reviews], async () => {
    await db.cards.delete(id);
    await db.schedules.delete(id);
    await db.reviews.where("cardId").equals(id).delete();
  });
}

/** Moves nothing and saves nothing: tells you whether IndexedDB works here. */
export async function storageWorks(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    return false;
  }
}

/** Every card in every deck, with the name of its deck, for searching. */
export async function listAllCards(): Promise<{ card: Card; deckName: string; theme: Deck["theme"] }[]> {
  const [cards, decks] = await Promise.all([db.cards.toArray(), db.decks.toArray()]);
  const byId = new Map(decks.map((deck) => [deck.id, deck]));
  return cards
    .filter((card) => byId.has(card.deckId))
    .map((card) => ({ card, deckName: byId.get(card.deckId)!.name, theme: byId.get(card.deckId)!.theme }))
    .sort((a, b) => a.deckName.localeCompare(b.deckName) || a.card.createdAt - b.card.createdAt);
}

/**
 * Moves a card to another deck, and its schedule and history go with it.
 * Nothing moves into or out of the Difficult moves deck, which fills itself with copies, and a card that
 * matches one already in the target deck stays where it is.
 */
export async function moveCard(cardId: string, deckId: string): Promise<Result<{ deckName: string }>> {
  return db.transaction("rw", [db.cards, db.decks, db.schedules, db.reviews], async () => {
    const card = await db.cards.get(cardId);
    const target = await db.decks.get(deckId);
    if (!card) return { ok: false, error: "That card no longer exists." } as const;
    if (!target) return { ok: false, error: "That deck no longer exists." } as const;
    const source = await db.decks.get(card.deckId);
    if (target.theme === "difficult" || source?.theme === "difficult") {
      return { ok: false, error: "Cards can't be moved into or out of Difficult moves." } as const;
    }
    if (card.deckId === deckId) return { ok: false, error: `It is already in ${target.name}.` } as const;
    const there = await db.cards.where("deckId").equals(deckId).toArray();
    if (there.some((other) => sameCard(other, card))) {
      return { ok: false, error: `${target.name} already has a card with that position and answer.` } as const;
    }
    const now = Date.now();
    await db.cards.put({ ...card, deckId, updatedAt: now });
    await db.decks.update(deckId, { updatedAt: now });
    await db.decks.update(card.deckId, { updatedAt: now });
    await db.schedules.where("cardId").equals(cardId).modify({ deckId });
    await db.reviews.where("cardId").equals(cardId).modify({ deckId });
    return { ok: true, deckName: target.name } as const;
  });
}
