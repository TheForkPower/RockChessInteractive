import type { Card } from "../domain/cards";
import { db, type Deck } from "./db";
import { newId } from "./repo";
import { buildTutorialCards, TUTORIAL_DECK_DESCRIPTION, TUTORIAL_DECK_NAME } from "./tutorialDeck";

const SEEDED_KEY = "tutorialDeckAdded";
const WELCOME_REMOVED_KEY = "tutorialWelcomeCardRemoved";
const WELCOME_PROMPT = "White to move. Play a good first move.";
const HINTS_REFRESHED_KEY = "tutorialHintsRefreshed";

/** The first hints written for the starter cards. They gave too much away, so unedited ones are replaced. */
const FIRST_HINTS = new Set([
  "Don't move the queen. Take something on e5.",
  "It isn't a capture and it isn't check. Look at the dark squares around the black king.",
  "A rook takes on e7 with check. Black has to recapture.",
  "Give up the queen on b8 to drag the knight away from d7.",
  "The bishop takes on h7 with check. There is more to come on g7.",
  "Look down the d-file.",
  "Attack the bishop on c4. Capturing it would come with check.",
  "Take the pawn on e6 and let the king's cover fall apart.",
  "Take on d4 with the rook. The king on a7 is about to be pulled into the open."
]);

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

/** Swaps the first, too-obvious hints for the current ones. A hint the person has changed is left alone. */
async function refreshHintsOnce(): Promise<void> {
  if (await db.meta.get(HINTS_REFRESHED_KEY)) return;
  await db.meta.put({ key: HINTS_REFRESHED_KEY, value: Date.now() });
  const current = new Map(buildTutorialCards().map((draft) => [`${draft.fen}|${draft.answer[0]?.san}`, draft.hint]));
  const decks = await db.decks.filter((deck) => deck.theme === "tutorial").toArray();
  for (const deck of decks) {
    const cards = await db.cards.where("deckId").equals(deck.id).toArray();
    for (const card of cards) {
      const fresh = current.get(`${card.fen}|${card.answer[0]?.san}`);
      if (fresh && FIRST_HINTS.has(card.hint)) await db.cards.update(card.id, { hint: fresh });
    }
  }
}

/**
 * Installs the starter deck the first time the app runs. A flag is saved with
 * it, so deleting the deck later doesn't bring it back on the next visit.
 * Returns true if it added the deck now.
 */
export async function installTutorialDeckOnce(): Promise<boolean> {
  return db.transaction("rw", db.decks, db.cards, db.meta, async () => {
    await removeWelcomeCardOnce();
    await refreshHintsOnce();
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
    await db.meta.put({ key: HINTS_REFRESHED_KEY, value: Date.now() });
    const taken = await db.decks.filter((deck) => deck.name.toLowerCase() === TUTORIAL_DECK_NAME.toLowerCase()).first();
    return insertTutorialDeck(taken ? `${TUTORIAL_DECK_NAME} (starter)` : TUTORIAL_DECK_NAME);
  });
}
