import { beforeEach, describe, expect, it } from "vitest";
import { buildDeckCards, type CardDraft } from "../domain/cards";
import { START_FEN } from "../domain/fen";
import { parseMovetext } from "../domain/pgn";
import { db } from "./db";
import { addCards, createDeck, deleteCard, deleteDeck, getCard, listAllCards, listCards, listDecks, moveCard, renameDeck, updateCard } from "./repo";

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

describe("moving cards between decks", () => {
  async function two() {
    const a = await createDeck("A");
    const b = await createDeck("B");
    if (!a.ok || !b.ok) throw new Error("setup");
    await addCards(a.deck.id, drafts("1. e4 e5 2. Nf3"));
    return { a: a.deck.id, b: b.deck.id };
  }

  it("moves the card, its progress and its history together", async () => {
    const { a, b } = await two();
    const [card] = await listCards(a);
    await db.schedules.put({ cardId: card.id, deckId: a, due: 1, stability: 1, difficulty: 1, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state: 2, lastReview: 0 });
    expect(await moveCard(card.id, b)).toEqual({ ok: true, deckName: "B" });
    expect((await getCard(card.id))?.deckId).toBe(b);
    expect((await db.schedules.get(card.id))?.deckId).toBe(b);
    expect(await listCards(a)).toHaveLength(1);
    expect(await listDecks(0)).toMatchObject([{ name: "A", cardCount: 1 }, { name: "B", cardCount: 1, dueCount: 0, learningCount: 1 }]);
  });

  it("refuses the deck it is already in, and a deck with the same card", async () => {
    const { a, b } = await two();
    const [card] = await listCards(a);
    expect(await moveCard(card.id, a)).toMatchObject({ ok: false, error: "It is already in A." });
    await addCards(b, drafts("1. e4 e5 2. Nf3"));
    expect(await moveCard(card.id, b)).toMatchObject({ ok: false, error: expect.stringContaining("already has a card") });
    expect((await getCard(card.id))?.deckId).toBe(a);
  });

  it("refuses a missing card or deck", async () => {
    const { a } = await two();
    const [card] = await listCards(a);
    expect(await moveCard("nope", a)).toMatchObject({ ok: false });
    expect(await moveCard(card.id, "nope")).toMatchObject({ ok: false });
  });

  it("keeps cards out of and away from Difficult moves", async () => {
    const { a } = await two();
    const [card] = await listCards(a);
    await db.decks.add({ id: "hard", name: "Difficult moves", theme: "difficult", createdAt: 0, updatedAt: 0 });
    expect(await moveCard(card.id, "hard")).toMatchObject({ ok: false, error: expect.stringContaining("Difficult") });
  });
});

describe("deck counts and every-card listing", () => {
  it("splits cards into new, learning and mastered, with due across them", async () => {
    const made = await createDeck("Counts");
    if (!made.ok) throw new Error(made.error);
    await addCards(made.deck.id, drafts("1. e4 e5 2. Nf3 Nc6 3. Bb5"));
    const cards = await listCards(made.deck.id);
    const base = { deckId: made.deck.id, stability: 1, difficulty: 1, learningSteps: 0, reps: 1, lapses: 0, lastReview: 0 };
    await db.schedules.put({ ...base, cardId: cards[0].id, due: 100, scheduledDays: 2, state: 2 });
    await db.schedules.put({ ...base, cardId: cards[1].id, due: 10_000, scheduledDays: 30, state: 2 });
    expect((await listDecks(500))[0]).toMatchObject({ cardCount: 3, newCount: 1, learningCount: 1, masteredCount: 1, dueCount: 1 });
  });

  it("lists every card with its deck's name", async () => {
    const a = await createDeck("Zed");
    const b = await createDeck("Alpha");
    if (!a.ok || !b.ok) throw new Error("setup");
    await addCards(a.deck.id, drafts("1. e4 e5"));
    await addCards(b.deck.id, drafts("1. d4 d5"));
    const all = await listAllCards();
    expect(all.map((entry) => entry.deckName)).toEqual(["Alpha", "Zed"]);
  });
});
