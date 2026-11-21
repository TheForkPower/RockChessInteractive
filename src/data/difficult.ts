import type { Card } from "../domain/cards";
import { db, type Deck } from "./db";
import { newId } from "./repo";

export const DIFFICULT_DECK_NAME = "Difficult moves";
export const DIFFICULT_DECK_DESCRIPTION =
  "The cards that give you the most trouble. They arrive here as you practise, and you can add or delete cards yourself.";

const SEEDED_KEY = "difficultDeckAdded";

async function findDifficultDeck(): Promise<Deck | undefined> {
  return db.decks.filter((deck) => deck.theme === "difficult").first();
}

async function insertDifficultDeck(): Promise<Deck> {
  const now = Date.now();
  const taken = await db.decks.filter((deck) => deck.name.toLowerCase() === DIFFICULT_DECK_NAME.toLowerCase()).first();
  const deck: Deck = {
    id: newId(),
    name: taken ? `${DIFFICULT_DECK_NAME} (automatic)` : DIFFICULT_DECK_NAME,
    description: DIFFICULT_DECK_DESCRIPTION,
    theme: "difficult",
    color: "orange",
    createdAt: now,
    updatedAt: now,
  };
  await db.decks.add(deck);
  return deck;
}

/**
 * Makes the Difficult moves deck the first time the app runs. Deleting it
 * afterwards doesn't bring it back on the next visit; it comes back when a card
 * next gives you trouble, or when you add one by hand.
 */
export async function installDifficultDeckOnce(): Promise<void> {
  await db.transaction("rw", db.decks, db.meta, async () => {
    if (await db.meta.get(SEEDED_KEY)) return;
    await db.meta.put({ key: SEEDED_KEY, value: Date.now() });
    if (!(await findDifficultDeck())) await insertDifficultDeck();
  });
}

const sameMoves = (a: Card["answer"], b: Card["answer"]) =>
  a.length === b.length && a.every((move, index) => move.from === b[index].from && move.to === b[index].to && move.promotion === b[index].promotion);

export type DifficultResult = "added" | "again" | "already";

/**
 * Puts a card in the Difficult moves deck as a copy, so the original stays where
 * it is. `count` is how many times it has given trouble. When a copy is already
 * there, `again` raises its count, and `already` leaves it as it is.
 */
async function put(card: Card, mode: "struggle" | "mark"): Promise<DifficultResult> {
  return db.transaction("rw", db.decks, db.cards, db.meta, async () => {
    await db.meta.put({ key: SEEDED_KEY, value: Date.now() });
    const deck = (await findDifficultDeck()) ?? (await insertDifficultDeck());
    const now = Date.now();

    // A card that is already in the Difficult deck is its own copy.
    const inside = card.deckId === deck.id ? card : undefined;
    const existing =
      inside ??
      (await db.cards.where("deckId").equals(deck.id).toArray()).find(
        (other) => other.sourceCardId === card.id || (other.kind === card.kind && other.fen === card.fen && sameMoves(other.answer, card.answer)),
      );

    if (existing) {
      if (mode === "mark") return "already";
      await db.cards.update(existing.id, { struggles: (existing.struggles ?? 0) + 1, updatedAt: now });
      await db.decks.update(deck.id, { updatedAt: now });
      return "again";
    }

    const { id, deckId, ...rest } = card;
    void deckId;
    await db.cards.add({ ...rest, id: newId(), deckId: deck.id, sourceCardId: id, struggles: 1, createdAt: now, updatedAt: now });
    await db.decks.update(deck.id, { updatedAt: now });
    return "added";
  });
}

/** A card gave trouble in practice: add it to the Difficult moves deck, or count another time. */
export function recordStruggle(card: Card): Promise<DifficultResult> {
  return put(card, "struggle");
}

/** The person chose to add this card to the Difficult moves deck. */
export function markDifficult(card: Card): Promise<DifficultResult> {
  return put(card, "mark");
}
