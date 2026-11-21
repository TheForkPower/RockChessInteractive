import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../data/db";
import { addCards, createDeck, listCards, listDecks } from "../../data/repo";
import { installDifficultDeckOnce, markDifficult, recordStruggle } from "../../data/difficult";
import { installTutorialDeckOnce } from "../../data/seed";
import { buildDeckCards } from "../../domain/cards";
import { START_FEN } from "../../domain/fen";
import { parseMovetext } from "../../domain/pgn";

vi.mock("../../board/Board", async () => await import("../../test/boardMock"));

import { DecksPage } from "./DecksPage";

const click = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));

async function seed(name: string, text: string) {
  const parsed = parseMovetext(text, START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const built = buildDeckCards(parsed.tree, { side: "w", shape: "moves", context: "rest" });
  if (!built.ok) throw new Error(built.error);
  const made = await createDeck(name);
  if (!made.ok) throw new Error(made.error);
  await addCards(made.deck.id, built.drafts);
  return made.deck.id;
}

function renderPage(path = "/decks") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DecksPage />
    </MemoryRouter>,
  );
}

/** Opens one deck's page and waits for its cards. */
async function openDeck(id: string, name: string, extra = "") {
  renderPage(`/decks?deck=${id}${extra}`);
  await screen.findByRole("heading", { level: 1, name });
  await screen.findAllByRole("button", { name: "Open" });
}

const tile = (name: string) => {
  const item = screen.getAllByRole("listitem").find((li) => li.querySelector("h2")?.textContent === name);
  if (!item) throw new Error(`No tile called ${name}`);
  return within(item);
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("Decks page: the grid of packs", () => {
  it("points to Create when there are no decks", async () => {
    renderPage();
    expect(await screen.findByText(/You have no decks yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Make cards/ })).toHaveAttribute("href", "/create");
  });

  it("shows each deck as a tile with its card count", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    await seed("Queen's Gambit", "1. d4 d5 2. c4");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    expect(tile("Queen's Gambit").getByText("2 cards")).toBeInTheDocument();
    expect(tile("Ruy Lopez").getByText("3 cards")).toBeInTheDocument();
  });

  it("gives every tile Review and Learn buttons that go to the right place", async () => {
    const id = await seed("Alpha", "1. e4 e5");
    renderPage();
    await screen.findByRole("heading", { name: "Alpha" });
    expect(tile("Alpha").getByRole("link", { name: "Review Alpha" })).toHaveAttribute("href", `/review?deck=${id}`);
    expect(tile("Alpha").getByRole("link", { name: "Learn Alpha" })).toHaveAttribute("href", `/review?deck=${id}&mode=learn`);
  });

  it("keeps Review and Learn switched off, and says why, on a deck with no cards", async () => {
    await createDeck("Empty");
    renderPage();
    await screen.findByRole("heading", { name: "Empty" });
    const review = tile("Empty").getByRole("button", { name: "Review" });
    expect(review).toHaveAttribute("aria-disabled", "true");
    expect(review).toHaveAccessibleDescription("This deck has no cards yet.");
    expect(tile("Empty").getByRole("button", { name: "Learn" })).toHaveAttribute("aria-disabled", "true");
  });

  it("gives new decks different colours", async () => {
    await createDeck("One");
    await createDeck("Two");
    const [a, b] = await listDecks();
    expect(a.color).toBeTruthy();
    expect(a.color).not.toBe(b.color);
  });

  it("opens a deck from its name", async () => {
    await seed("Alpha", "1. e4 e5");
    renderPage();
    await userEvent.click(await screen.findByRole("link", { name: "Alpha" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Alpha" })).toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: "Open" })).toHaveLength(1);
  });

  it("opens the deck named in the address", async () => {
    await seed("Alpha", "1. e4 e5");
    const id = await seed("Beta", "1. d4 d5");
    renderPage(`/decks?deck=${id}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Beta" })).toBeInTheDocument();
  });

  it("goes back to the grid", async () => {
    const id = await seed("Alpha", "1. e4 e5");
    await openDeck(id, "Alpha");
    await userEvent.click(screen.getByRole("link", { name: "All decks" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
  });
});

describe("Decks page: the menu on each tile", () => {
  it("opens, lists the detailed options, and closes with Escape", async () => {
    await seed("Alpha", "1. e4 e5");
    renderPage();
    const button = await screen.findByRole("button", { name: "More options for Alpha" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = within(screen.getByRole("menu", { name: "More options for Alpha" }));
    expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Edit cards",
      "Rename",
      "Change colour",
      "Delete deck",
    ]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("moves through the items with the arrow keys", async () => {
    await seed("Alpha", "1. e4 e5");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More options for Alpha" }));
    expect(screen.getByRole("menuitem", { name: "Edit cards" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete deck" })).toHaveFocus();
  });

  it("closes when you click elsewhere", async () => {
    await seed("Alpha", "1. e4 e5");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More options for Alpha" }));
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Edit cards opens the deck", async () => {
    await seed("Alpha", "1. e4 e5");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More options for Alpha" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit cards" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Alpha" })).toBeInTheDocument();
  });

  it("Rename opens the deck with the name box ready", async () => {
    await seed("Alpha", "1. e4 e5");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More options for Alpha" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(await screen.findByLabelText("Deck name")).toHaveValue("Alpha");
  });

  it("Change colour opens the deck with the colours showing", async () => {
    await seed("Alpha", "1. e4 e5");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More options for Alpha" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change colour" }));
    expect(await screen.findByRole("radiogroup", { name: "Deck colour" })).toBeInTheDocument();
  });

  it("Delete deck opens the deck with the question already asked", async () => {
    const id = await seed("Alpha", "1. e4 e5 2. Nf3");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More options for Alpha" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete deck" }));
    expect(await screen.findByText(/deletes the deck and all 2 of its cards/)).toBeInTheDocument();
    expect(await listDecks()).toHaveLength(1);
    expect(await listCards(id)).toHaveLength(2);
  });
});

describe("Decks page: one deck", () => {
  it("lists the deck's cards", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    await openDeck(id, "Open");
    expect(screen.getByText("Answer: 1. e4")).toBeInTheDocument();
    expect(screen.getByText("2 cards")).toBeInTheDocument();
  });

  it("offers Review and Learn in the banner", async () => {
    const id = await seed("Open", "1. e4 e5");
    await openDeck(id, "Open");
    expect(screen.getByRole("link", { name: "Review Open" })).toHaveAttribute("href", `/review?deck=${id}`);
    expect(screen.getByRole("link", { name: "Learn Open" })).toHaveAttribute("href", `/review?deck=${id}&mode=learn`);
  });

  it("opens a card to show its explanation and clickable continuation, variations included", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6");
    await openDeck(id, "Open");
    const first = screen.getAllByRole("listitem").find((item) => within(item).queryByText("Answer: 1. e4"));
    if (!first) throw new Error("card not found");
    await userEvent.click(within(first).getByRole("button", { name: "Open" }));
    const moves = within(within(first).getByRole("group", { name: "Continuation" }));
    expect(moves.getByRole("button", { name: "2. Bc4" })).toBeInTheDocument();
    await userEvent.click(moves.getByRole("button", { name: "2... Nf6" }));
    expect(within(first).getByTestId("board")).toHaveAttribute("data-fen", expect.stringContaining("5n2"));
    await userEvent.click(within(first).getByRole("button", { name: "Close" }));
    expect(within(first).queryByRole("group", { name: "Continuation" })).not.toBeInTheDocument();
  });

  it("edits a card and keeps the change", async () => {
    const id = await seed("Open", "1. e4 e5");
    await openDeck(id, "Open");
    await click("Edit");
    expect(screen.getByRole("heading", { level: 1, name: "Edit card" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Open the game." } });
    fireEvent.change(screen.getByLabelText("Other accepted moves (optional)"), { target: { value: "d4, c4" } });
    fireEvent.change(screen.getByLabelText("Explanation"), { target: { value: "Take space." } });
    fireEvent.change(screen.getByLabelText("Tags (optional)"), { target: { value: "kings pawn, basics" } });
    await click("Save changes");
    expect((await screen.findAllByText("Open the game.")).length).toBeGreaterThan(0);
    const [card] = await listCards(id);
    expect(card).toMatchObject({ prompt: "Open the game.", explanation: "Take space.", tags: ["kings pawn", "basics"] });
    expect(card.alternatives.map((move) => move.san)).toEqual(["d4", "c4"]);
    expect(card.updatedAt).toBeGreaterThanOrEqual(card.createdAt);
  });

  it("won't save an edit with an answer that isn't legal", async () => {
    const id = await seed("Open", "1. e4 e5");
    await openDeck(id, "Open");
    await click("Edit");
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "e5" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't a legal move/);
    await click("Save changes");
    expect((await listCards(id))[0].answer[0].san).toBe("e4");
  });

  it("cancels an edit", async () => {
    const id = await seed("Open", "1. e4 e5");
    await openDeck(id, "Open");
    await click("Edit");
    await click("Cancel");
    expect(screen.getByRole("heading", { level: 1, name: "Open" })).toBeInTheDocument();
  });

  it("asks before deleting a card", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    await openDeck(id, "Open");
    const row = screen.getAllByRole("listitem").find((item) => within(item).queryByText("Answer: 1. e4"));
    if (!row) throw new Error("card not found");
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(row).getByRole("button", { name: "Keep it" }));
    expect(await listCards(id)).toHaveLength(2);

    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(row).getByRole("button", { name: "Delete card" }));
    await waitFor(async () => expect(await listCards(id)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText("Answer: 1. e4")).not.toBeInTheDocument());
  });

  it("renames a deck, and refuses a name that's taken", async () => {
    const id = await seed("Alpha", "1. e4 e5");
    await seed("Beta", "1. d4 d5");
    await openDeck(id, "Alpha");
    await click("Rename");
    fireEvent.change(screen.getByLabelText("Deck name"), { target: { value: "beta" } });
    await click("Save name");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already have a deck called "Beta"/);
    fireEvent.change(screen.getByLabelText("Deck name"), { target: { value: "Aardvark" } });
    await click("Save name");
    expect(await screen.findByRole("heading", { level: 1, name: "Aardvark" })).toBeInTheDocument();
    expect((await listDecks()).map((deck) => deck.name)).toEqual(["Aardvark", "Beta"]);
  });

  it("changes a deck's colour and keeps it", async () => {
    const id = await seed("Alpha", "1. e4 e5");
    await openDeck(id, "Alpha");
    await click("Change colour");
    const group = within(screen.getByRole("radiogroup", { name: "Deck colour" }));
    await userEvent.click(group.getByRole("radio", { name: "Teal" }));
    await waitFor(async () => expect((await listDecks())[0].color).toBe("teal"));
    await waitFor(() => expect(group.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true"));
    expect(group.getByRole("radio", { name: "Ember" })).toHaveAttribute("aria-checked", "false");
  });

  it("asks before deleting a deck and its cards", async () => {
    const id = await seed("Alpha", "1. e4 e5 2. Nf3");
    await openDeck(id, "Alpha");
    await click("Delete deck");
    expect(screen.getByText(/deletes the deck and all 2 of its cards/)).toBeInTheDocument();
    await click("Keep it");
    expect(await listDecks()).toHaveLength(1);

    await click("Delete deck");
    await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Delete deck" }));
    expect(await screen.findByText(/You have no decks yet/)).toBeInTheDocument();
    expect(await db.cards.count()).toBe(0);
  });
});

describe("Decks page: the starter deck", () => {
  it("shows as an ember tile labelled as the starter deck", async () => {
    await installTutorialDeckOnce();
    renderPage();
    await screen.findByRole("heading", { name: "Famous moves" });
    expect(tile("Famous moves").getByText("Starter deck, 9 cards")).toBeInTheDocument();
    expect((await listDecks())[0].color).toBe("ember");
  });

  it("opens with its banner and nine cards, and no welcome card", async () => {
    await installTutorialDeckOnce();
    const [deck] = await listDecks();
    await openDeck(deck.id, "Famous moves");
    expect(screen.getByText("Starter deck")).toBeInTheDocument();
    expect(screen.getByText("9 cards")).toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: "Open" })).toHaveLength(9);
    expect(screen.queryByText("White to move. Play a good first move.")).not.toBeInTheDocument();
  });

  it("opens a starter card like any other", async () => {
    await installTutorialDeckOnce();
    const [deck] = await listDecks();
    await openDeck(deck.id, "Famous moves");
    await userEvent.click(screen.getAllByRole("button", { name: "Open" })[0]);
    expect(screen.getAllByText(/Nxe5/).length).toBeGreaterThan(0);
  });

  it("offers to add the starter deck back after it is deleted, and does", async () => {
    await installTutorialDeckOnce();
    const [deck] = await listDecks();
    await openDeck(deck.id, "Famous moves");
    await click("Delete deck");
    await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Delete deck" }));
    await screen.findByText(/You have no decks yet/);
    await click("Add the Famous moves deck");
    expect(await screen.findByRole("heading", { level: 2, name: "Famous moves" })).toBeInTheDocument();
    expect((await listDecks())[0].theme).toBe("tutorial");
  });

  it("hides the add button while the deck is there", async () => {
    await installTutorialDeckOnce();
    renderPage();
    await screen.findByRole("heading", { name: "Famous moves" });
    expect(screen.queryByRole("button", { name: "Add the Famous moves deck" })).not.toBeInTheDocument();
  });
});

describe("Decks page: Difficult moves", () => {
  const difficult = async () => (await listDecks()).find((deck) => deck.theme === "difficult")!;

  it("shows as an orange tile that says it fills itself, even when empty", async () => {
    await installDifficultDeckOnce();
    renderPage();
    await screen.findByRole("heading", { name: "Difficult moves" });
    expect(tile("Difficult moves").getByText("Fills itself, 0 cards")).toBeInTheDocument();
    const item = screen.getAllByRole("listitem").find((li) => li.querySelector("h2")?.textContent === "Difficult moves")!;
    expect(item.getAttribute("style")).toContain("rgb(194, 84, 0)");
  });

  it("explains how it fills when it is empty", async () => {
    await installDifficultDeckOnce();
    const deck = await difficult();
    renderPage(`/decks?deck=${deck.id}`);
    await screen.findByRole("heading", { level: 1, name: "Difficult moves" });
    expect(screen.getByText("Fills itself as you practise")).toBeInTheDocument();
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it("lets you add a card from another deck, and says so", async () => {
    const id = await seed("Ruy Lopez", "1. e4 e5 2. Nf3 Nc6");
    await openDeck(id, "Ruy Lopez");
    const [first] = screen.getAllByRole("button", { name: "Mark as difficult" });
    await userEvent.click(first);
    expect(await screen.findByText("Added to Difficult moves.")).toBeInTheDocument();
    await userEvent.click(first);
    expect(await screen.findByText("Already in Difficult moves.")).toBeInTheDocument();
    expect(await listCards((await difficult()).id)).toHaveLength(1);
  });

  it("lists the trickiest card first, counts the trouble, and doesn't offer to mark its own cards", async () => {
    const id = await seed("Ruy Lopez", "1. e4 e5 2. Nf3 Nc6");
    const [one, two] = await listCards(id);
    await markDifficult(one);
    await recordStruggle(two);
    await recordStruggle(two);
    const deck = await difficult();
    renderPage(`/decks?deck=${deck.id}`);
    await screen.findByRole("heading", { level: 1, name: "Difficult moves" });
    const rows = await screen.findAllByRole("listitem");
    const cardRows = rows.filter((row) => within(row).queryByRole("button", { name: "Edit" }));
    expect(within(cardRows[0]).getByText("Gave trouble 2 times")).toBeInTheDocument();
    expect(within(cardRows[1]).getByText("Gave trouble once")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as difficult" })).not.toBeInTheDocument();
  });

  it("deletes a card from it with the usual question, leaving the original", async () => {
    const id = await seed("Ruy Lopez", "1. e4 e5");
    const [card] = await listCards(id);
    await markDifficult(card);
    const deck = await difficult();
    renderPage(`/decks?deck=${deck.id}`);
    await screen.findByRole("heading", { level: 1, name: "Difficult moves" });
    await screen.findByRole("button", { name: "Edit" });
    await click("Delete");
    await click("Delete card");
    await waitFor(async () => expect(await listCards(deck.id)).toHaveLength(0));
    expect(await listCards(id)).toHaveLength(1);
  });
});
