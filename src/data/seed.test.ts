import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
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
    expect(decks[0].cardCount).toBe(10);
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
    expect((await listCards(back.id)).length).toBe(10);
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
});
