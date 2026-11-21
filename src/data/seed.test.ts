import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { addCards } from "./repo";
import { createDeck, deleteDeck, listCards, listDecks } from "./repo";
import { installTutorialDeckOnce, restoreTutorialDeck } from "./seed";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("starter deck", () => {
  it("installs once, with its cards", async () => {
    expect(await installTutorialDeckOnce()).toBe(true);
    const decks = await listDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0].theme).toBe("tutorial");
    expect(decks[0].cardCount).toBe(9);
    expect(await installTutorialDeckOnce()).toBe(false);
    expect(await listDecks()).toHaveLength(1);
  });

  it("stays deleted once the person deletes it", async () => {
    await installTutorialDeckOnce();
    const [deck] = await listDecks();
    await deleteDeck(deck.id);
    expect(await installTutorialDeckOnce()).toBe(false);
    expect(await listDecks()).toHaveLength(0);
  });

  it("can be restored, and restoring twice adds nothing", async () => {
    await installTutorialDeckOnce();
    const [deck] = await listDecks();
    await deleteDeck(deck.id);
    const back = await restoreTutorialDeck();
    expect((await listCards(back.id)).length).toBe(9);
    await restoreTutorialDeck();
    expect(await listDecks()).toHaveLength(1);
  });

  it("restores under another name if the person already has a deck with that name", async () => {
    await createDeck("Famous moves");
    const deck = await restoreTutorialDeck();
    expect(deck.name).toBe("Famous moves (starter)");
  });

  it("leaves a person's own decks alone", async () => {
    await createDeck("My openings");
    await installTutorialDeckOnce();
    expect((await listDecks()).map((d) => d.name).sort()).toEqual(["Famous moves", "My openings"]);
  });

  it("gives the deck the ember colour", async () => {
    await installTutorialDeckOnce();
    expect((await listDecks())[0].color).toBe("ember");
  });

  it("takes the old welcome card out of a deck that already has it, once", async () => {
    await installTutorialDeckOnce();
    const [deck] = await listDecks();
    // Put the old card back as an earlier version would have left it, and forget the clean-up.
    const welcome = {
      kind: "move" as const,
      category: "opening" as const,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      side: "w" as const,
      prompt: "White to move. Play a good first move.",
      hint: "",
      answer: [{ from: "e2", to: "e4", san: "e4" }],
      alternatives: [],
      explanation: "",
      continuation: "",
      notes: "",
      tags: ["famous moves"],
    };
    await addCards(deck.id, [welcome]);
    await db.meta.delete("tutorialWelcomeCardRemoved");
    expect((await listCards(deck.id)).length).toBe(10);
    await installTutorialDeckOnce();
    const cards = await listCards(deck.id);
    expect(cards).toHaveLength(9);
    expect(cards.some((card) => card.prompt.startsWith("White to move. Play a good"))).toBe(false);
  });

  it("leaves an edited welcome card alone", async () => {
    await installTutorialDeckOnce();
    const [deck] = await listDecks();
    await addCards(deck.id, [
      {
        kind: "move",
        category: "opening",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        side: "w",
        prompt: "My own wording.",
        hint: "",
        answer: [{ from: "e2", to: "e4", san: "e4" }],
        alternatives: [],
        explanation: "",
        continuation: "",
        notes: "",
        tags: ["famous moves"],
      },
    ]);
    await db.meta.delete("tutorialWelcomeCardRemoved");
    await installTutorialDeckOnce();
    expect(await listCards(deck.id)).toHaveLength(10);
  });
});
