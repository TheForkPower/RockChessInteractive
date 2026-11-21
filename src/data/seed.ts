import type { Card } from "../domain/cards";
import { db, type Deck } from "./db";
import { newId } from "./repo";
import { buildTutorialCards, TUTORIAL_DECK_DESCRIPTION, TUTORIAL_DECK_NAME } from "./tutorialDeck";

const SEEDED_KEY = "tutorialDeckAdded";

async function insertTutorialDeck(name = TUTORIAL_DECK_NAME): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = {
    id: newId(),
    name,
    description: TUTORIAL_DECK_DESCRIPTION,
    theme: "tutorial",
    createdAt: now,
    updatedAt: now,
  };
  const cards: Card[] = buildTutorialCards().map((draft, index) => ({
    ...draft,
    id: newId(),
    deckId: deck.id,
    createdAt: now + index,
    updatedAt: now,
  }));
  await db.decks.add(deck);
  await db.cards.bulkAdd(cards);
  return deck;
}

/**
 * Installs the starter deck the first time the app runs. A flag is saved with
 * it, so deleting the deck later doesn't bring it back on the next visit.
 * Returns true if it added the deck now.
 */
export async function installTutorialDeckOnce(): Promise<boolean> {
  return db.transaction("rw", db.decks, db.cards, db.meta, async () => {
    if (await db.meta.get(SEEDED_KEY)) return false;
    await db.meta.put({ key: SEEDED_KEY, value: Date.now() });
    const existing = await db.decks.filter((deck) => deck.theme === "tutorial").first();
    if (existing) return false;
    await insertTutorialDeck();
    return true;
  });
}

/** Puts the starter deck back, for someone who deleted it. Does nothing if it is already there. */
export async function restoreTutorialDeck(): Promise<Deck> {
  return db.transaction("rw", db.decks, db.cards, db.meta, async () => {
    const existing = await db.decks.filter((deck) => deck.theme === "tutorial").first();
    if (existing) return existing;
    await db.meta.put({ key: SEEDED_KEY, value: Date.now() });
    const taken = await db.decks.filter((deck) => deck.name.toLowerCase() === TUTORIAL_DECK_NAME.toLowerCase()).first();
    return insertTutorialDeck(taken ? `${TUTORIAL_DECK_NAME} (starter)` : TUTORIAL_DECK_NAME);
  });
}
