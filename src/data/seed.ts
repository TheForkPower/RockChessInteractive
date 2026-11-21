import type { Card } from "../domain/cards";
import { db, type Deck } from "./db";
import { newId } from "./repo";
import { buildTutorialCards, TUTORIAL_DECK_DESCRIPTION, TUTORIAL_DECK_NAME } from "./tutorialDeck";

const SEEDED_KEY = "tutorialDeckAdded";
const WELCOME_REMOVED_KEY = "tutorialWelcomeCardRemoved";
const WELCOME_PROMPT = "White to move. Play a good first move.";

/**
 * The first version of the starter deck began with a card explaining how cards
 * work. It was dropped. This takes it out of decks that already have it, once,
 * and only if it still looks the way it was installed.
 */
async function removeWelcomeCardOnce(): Promise<void> {
  if (await db.meta.get(WELCOME_REMOVED_KEY)) return;
  await db.meta.put({ key: WELCOME_REMOVED_KEY, value: Date.now() });
  const decks = await db.decks.filter((deck) => deck.theme === "tutorial").toArray();
  for (const deck of decks) {
    const cards = await db.cards.where("deckId").equals(deck.id).toArray();
    const welcome = cards.find(
      (card) => card.prompt === WELCOME_PROMPT && card.kind === "move" && card.answer[0]?.san === "e4" && card.tags.includes("famous moves"),
    );
    if (welcome) await db.cards.delete(welcome.id);
  }
}

async function insertTutorialDeck(name = TUTORIAL_DECK_NAME): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = {
    id: newId(),
    name,
    description: TUTORIAL_DECK_DESCRIPTION,
    theme: "tutorial",
    color: "ember",
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
    await removeWelcomeCardOnce();
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
    await db.meta.put({ key: WELCOME_REMOVED_KEY, value: Date.now() });
    const taken = await db.decks.filter((deck) => deck.name.toLowerCase() === TUTORIAL_DECK_NAME.toLowerCase()).first();
    return insertTutorialDeck(taken ? `${TUTORIAL_DECK_NAME} (starter)` : TUTORIAL_DECK_NAME);
  });
}
