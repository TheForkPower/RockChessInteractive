import { beforeEach, describe, expect, it } from "vitest";
import { buildDeckCards } from "../domain/cards";
import { START_FEN } from "../domain/fen";
import { parseMovetext } from "../domain/pgn";
import { db } from "./db";
import { DIFFICULT_DECK_NAME, installDifficultDeckOnce, markDifficult, recordStruggle } from "./difficult";
import { addCards, createDeck, deleteCard, deleteDeck, listCards, listDecks } from "./repo";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function deckWithCards() {
  const made = await createDeck("Openings");
  if (!made.ok) throw new Error(made.error);
  const parsed = parseMovetext("1. e4 e5 2. Nf3 Nc6", START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const built = buildDeckCards(parsed.tree, { side: "w", shape: "moves", context: "rest" });
  if (!built.ok) throw new Error(built.error);
  await addCards(made.deck.id, built.drafts);
  return { deck: made.deck, cards: await listCards(made.deck.id) };
}

const difficult = async () => (await listDecks()).find((deck) => deck.theme === "difficult");

describe("Difficult moves deck", () => {
  it("is made once, empty and orange, and stays deleted", async () => {
    await installDifficultDeckOnce();
    const deck = await difficult();
    expect(deck?.name).toBe(DIFFICULT_DECK_NAME);
    expect(deck?.color).toBe("orange");
    expect(deck?.cardCount).toBe(0);
    await installDifficultDeckOnce();
    expect((await listDecks()).filter((item) => item.theme === "difficult")).toHaveLength(1);

    await deleteDeck(deck!.id);
    await installDifficultDeckOnce();
    expect(await difficult()).toBeUndefined();
  });

  it("is made when the first card gives trouble, even if it was deleted before", async () => {
    await installDifficultDeckOnce();
    await deleteDeck((await difficult())!.id);
    const { cards } = await deckWithCards();
    expect(await recordStruggle(cards[0])).toBe("added");
    expect(await difficult()).toBeDefined();
  });

  it("copies a card and counts each further struggle on that one copy", async () => {
    const { deck, cards } = await deckWithCards();
    expect(await recordStruggle(cards[0])).toBe("added");
    expect(await recordStruggle(cards[0])).toBe("again");
    expect(await recordStruggle(cards[0])).toBe("again");
    const [copy] = await listCards((await difficult())!.id);
    expect(copy.struggles).toBe(3);
    expect(copy.sourceCardId).toBe(cards[0].id);
    expect(copy.fen).toBe(cards[0].fen);
    expect(copy.deckId).not.toBe(deck.id);
    expect(await listCards(deck.id)).toHaveLength(cards.length);
  });

  it("counts a struggle on a card in the deck itself", async () => {
    const { cards } = await deckWithCards();
    await recordStruggle(cards[0]);
    const [copy] = await listCards((await difficult())!.id);
    expect(await recordStruggle(copy)).toBe("again");
    const after = await listCards((await difficult())!.id);
    expect(after).toHaveLength(1);
    expect(after[0].struggles).toBe(2);
  });

  it("puts the card with the most trouble first", async () => {
    const { cards } = await deckWithCards();
    await recordStruggle(cards[0]);
    await recordStruggle(cards[1]);
    await recordStruggle(cards[1]);
    const listed = await listCards((await difficult())!.id);
    expect(listed.map((card) => card.sourceCardId)).toEqual([cards[1].id, cards[0].id]);
  });

  it("lets you add a card yourself once, and says so when it is already there", async () => {
    const { cards } = await deckWithCards();
    expect(await markDifficult(cards[0])).toBe("added");
    expect(await markDifficult(cards[0])).toBe("already");
    const listed = await listCards((await difficult())!.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].struggles).toBe(1);
  });

  it("lets you delete a card from it, and the original stays", async () => {
    const { deck, cards } = await deckWithCards();
    await markDifficult(cards[0]);
    const [copy] = await listCards((await difficult())!.id);
    await deleteCard(copy.id);
    expect(await listCards((await difficult())!.id)).toHaveLength(0);
    expect(await listCards(deck.id)).toHaveLength(cards.length);
    // And it can be added again afterwards.
    expect(await markDifficult(cards[0])).toBe("added");
  });

  it("uses another name when you already have a deck called Difficult moves", async () => {
    await createDeck(DIFFICULT_DECK_NAME);
    await installDifficultDeckOnce();
    const deck = await difficult();
    expect(deck?.name).toBe("Difficult moves (automatic)");
  });
});
