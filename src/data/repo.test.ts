import { beforeEach, describe, expect, it } from "vitest";
import { buildDeckCards, type CardDraft } from "../domain/cards";
import { START_FEN } from "../domain/fen";
import { parseMovetext } from "../domain/pgn";
import { db } from "./db";
import { addCards, createDeck, deleteCard, deleteDeck, getCard, listCards, listDecks, renameDeck, updateCard } from "./repo";

function drafts(text: string, side: "w" | "b" = "w"): CardDraft[] {
  const parsed = parseMovetext(text, START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const built = buildDeckCards(parsed.tree, { side, shape: "moves", context: "rest" });
  if (!built.ok) throw new Error(built.error);
  return built.drafts;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("decks", () => {
  it("creates a deck and lists it with a card count", async () => {
    const made = await createDeck("  Sicilian  ");
    if (!made.ok) throw new Error(made.error);
    expect(made.deck.name).toBe("Sicilian");
    expect(await listDecks()).toMatchObject([{ name: "Sicilian", cardCount: 0 }]);
  });

  it("refuses an empty name and a name already used, ignoring case", async () => {
    expect(await createDeck("   ")).toEqual({ ok: false, error: "Give the deck a name." });
    await createDeck("Sicilian");
    expect(await createDeck("sicilian")).toMatchObject({ ok: false, error: expect.stringContaining("already have") });
  });

  it("renames a deck, but not to another deck's name", async () => {
    const a = await createDeck("A");
    await createDeck("B");
    if (!a.ok) throw new Error(a.error);
    expect(await renameDeck(a.deck.id, "B")).toMatchObject({ ok: false });
    expect(await renameDeck(a.deck.id, "Alpha")).toEqual({ ok: true });
    expect((await listDecks()).map((deck) => deck.name)).toEqual(["Alpha", "B"]);
  });

  it("deletes a deck together with its cards", async () => {
    const made = await createDeck("Gone");
    if (!made.ok) throw new Error(made.error);
    await addCards(made.deck.id, drafts("1. e4 e5 2. Nf3"));
    await deleteDeck(made.deck.id);
    expect(await db.cards.count()).toBe(0);
    expect(await listDecks()).toEqual([]);
  });
});

describe("cards", () => {
  it("saves cards, keeping variations on the back, and reads them back", async () => {
    const made = await createDeck("Open");
    if (!made.ok) throw new Error(made.error);
    const result = await addCards(made.deck.id, drafts("1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6"));
    expect(result).toMatchObject({ added: 2, skipped: 0 });
    const cards = await listCards(made.deck.id);
    expect(cards.map((card) => card.answer[0].san)).toEqual(["e4", "Nf3"]);
    expect(cards[1].continuation).toBe("2. Nf3 (2. Bc4) 2... Nc6");
    expect((await getCard(cards[0].id))?.fen).toBe(START_FEN);
    expect((await listDecks())[0].cardCount).toBe(2);
  });

  it("skips a card that is already in the deck", async () => {
    const made = await createDeck("Open");
    if (!made.ok) throw new Error(made.error);
    await addCards(made.deck.id, drafts("1. e4 e5 2. Nf3"));
    const again = await addCards(made.deck.id, drafts("1. e4 e5 2. Nf3 Nc6"));
    expect(again).toMatchObject({ added: 0, skipped: 2 });
    expect(await db.cards.count()).toBe(2);
  });

  it("saves the source PGN once and links cards to it", async () => {
    const made = await createDeck("Open");
    if (!made.ok) throw new Error(made.error);
    await addCards(made.deck.id, drafts("1. e4 e5 2. Nf3"), { title: "Test game", pgn: "1. e4 e5 2. Nf3", headers: {} });
    const [card] = await listCards(made.deck.id);
    expect(card.sourceId).toBeTruthy();
    expect((await db.sources.get(card.sourceId as string))?.title).toBe("Test game");
  });

  it("updates and deletes a card", async () => {
    const made = await createDeck("Open");
    if (!made.ok) throw new Error(made.error);
    await addCards(made.deck.id, drafts("1. e4 e5"));
    const [card] = await listCards(made.deck.id);
    await updateCard({ ...card, explanation: "Take the centre.", tags: ["kings pawn"] });
    expect(await getCard(card.id)).toMatchObject({ explanation: "Take the centre.", tags: ["kings pawn"] });
    await deleteCard(card.id);
    expect(await getCard(card.id)).toBeUndefined();
  });
});
