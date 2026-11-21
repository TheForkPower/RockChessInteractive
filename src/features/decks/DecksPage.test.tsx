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

const cardRows = () => screen.getAllByRole("listitem").filter((item) => within(item).queryByRole("button", { name: /^(Open|Close)$/ }));

/** Opens the "more options" menu on a card (the first one, unless a row is given) and picks an item from it. */
async function fromCardMenu(item: string, row?: HTMLElement) {
  const scope = row ? within(row) : screen;
  await userEvent.click(scope.getAllByRole("button", { name: /^More options for (Answer|Line):/ })[0]);
  await userEvent.click(scope.getByRole("menuitem", { name: item }));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("Decks page: the grid of packs", () => {
  it("asks for a name when there are no decks, and makes an empty deck", async () => {
    renderPage();
    expect(await screen.findByText(/You have no decks yet/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name your deck"), "Sicilian");
    await click("Create deck");
    expect(await screen.findByRole("heading", { level: 1, name: "Sicilian" })).toBeInTheDocument();
    const decks = await listDecks();
    expect(decks).toMatchObject([{ name: "Sicilian", cardCount: 0 }]);
    expect(await screen.findByText(/Nothing in here yet/)).toBeInTheDocument();
  });

  it("opens the new deck form from the New deck tile, and can be cancelled", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    expect(screen.queryByLabelText("Name your deck")).not.toBeInTheDocument();
    await click(/New deck/);
    expect(screen.getByLabelText("Name your deck")).toBeInTheDocument();
    await click("Cancel");
    expect(screen.queryByLabelText("Name your deck")).not.toBeInTheDocument();
  });

  it("asks for a name, and won't repeat one that is taken", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    await click(/New deck/);
    await click("Create deck");
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the deck a name.");
    await userEvent.type(screen.getByLabelText("Name your deck"), "ruy lopez");
    await click("Create deck");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already have a deck called/);
    expect(await listDecks()).toHaveLength(1);
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

  it("offers to add a card, or cards from a PGN, to this deck", async () => {
    const id = await seed("Alpha", "1. e4 e5");
    await openDeck(id, "Alpha");
    expect(screen.getByRole("link", { name: "Add a card" })).toHaveAttribute("href", `/create?deck=${id}`);
    expect(screen.getByRole("link", { name: "Add from a PGN" })).toHaveAttribute("href", `/create?deck=${id}&from=pgn`);
  });

  it("an empty deck says so and still offers to add a card", async () => {
    const made = await createDeck("Blank");
    if (!made.ok) throw new Error(made.error);
    renderPage(`/decks?deck=${made.deck.id}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Blank" })).toBeInTheDocument();
    expect(await screen.findByText(/Nothing in here yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a card" })).toBeInTheDocument();
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
    await fromCardMenu("Edit");
    expect(screen.getByRole("heading", { level: 1, name: "Edit card" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Open the game." } });
    await click("More options");
    fireEvent.change(screen.getByLabelText("Other accepted moves (optional)"), { target: { value: "d4, c4" } });
    fireEvent.change(screen.getByLabelText("Explanation (optional)"), { target: { value: "Take space." } });
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
    await fromCardMenu("Edit");
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "e5" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't a legal move/);
    await click("Save changes");
    expect((await listCards(id))[0].answer[0].san).toBe("e4");
  });

  it("cancels an edit", async () => {
    const id = await seed("Open", "1. e4 e5");
    await openDeck(id, "Open");
    await fromCardMenu("Edit");
    await click("Cancel");
    expect(screen.getByRole("heading", { level: 1, name: "Open" })).toBeInTheDocument();
  });

  it("asks before deleting a card", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    await openDeck(id, "Open");
    const row = screen.getAllByRole("listitem").find((item) => within(item).queryByText("Answer: 1. e4"));
    if (!row) throw new Error("card not found");
    await fromCardMenu("Delete", row);
    await userEvent.click(within(row).getByRole("button", { name: "Keep it" }));
    expect(await listCards(id)).toHaveLength(2);

    await fromCardMenu("Delete", row);
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

describe("Decks page: a deck's card rows", () => {
  it("shows only Open on each card, with Edit and Delete in a menu", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    await openDeck(id, "Open");
    for (const row of cardRows()) {
      const buttons = within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);
      expect(buttons).toEqual(["Open", expect.stringMatching(/^More options for/)]);
    }
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /^More options for/ })[0]);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Move to another deck", "Mark as difficult", "Delete"]);
  });

  it("lays every row out the same way, whatever the question's length", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    await openDeck(id, "Open");
    const shapes = cardRows().map((row) => {
      const layout = row.firstElementChild as HTMLElement;
      const open = within(row).getByRole("button", { name: "Open" });
      return `${layout.className}|${open.className}`;
    });
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).toContain("min-h-");
    expect(shapes[0]).toContain("min-w-");
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

  it("sits apart from the other decks as a small strip, with the message while it is empty", async () => {
    await seed("Ruy Lopez", "1. e4 e5");
    await installDifficultDeckOnce();
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    // Not one of the packs.
    expect(screen.getAllByRole("listitem").some((li) => li.querySelector("h2")?.textContent === "Difficult moves")).toBe(false);
    const strip = within(screen.getByRole("region", { name: "Difficult moves" }));
    expect(strip.getByText("This deck has no cards yet. Make some bad moves and it will be filled! :)")).toBeInTheDocument();
    expect(strip.getByRole("link", { name: "Difficult moves" })).toHaveAttribute("href", expect.stringContaining("/decks?deck="));
    expect(strip.queryByRole("link", { name: /^Review/ })).not.toBeInTheDocument();
    // It comes after the packs on the page.
    const pack = screen.getByRole("heading", { name: "Ruy Lopez" });
    expect(pack.compareDocumentPosition(screen.getByRole("region", { name: "Difficult moves" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "Difficult moves" }).getAttribute("style")).toContain("rgb(194, 84, 0)");
  });

  it("offers Review and Learn on the strip once it has cards", async () => {
    const id = await seed("Ruy Lopez", "1. e4 e5");
    await markDifficult((await listCards(id))[0]);
    renderPage();
    const strip = within(await screen.findByRole("region", { name: "Difficult moves" }));
    expect(await strip.findByText(/Fills itself as you practise. 1 card./)).toBeInTheDocument();
    expect(strip.getByRole("link", { name: "Review Difficult moves" })).toBeInTheDocument();
    expect(strip.getByRole("link", { name: "Learn Difficult moves" })).toBeInTheDocument();
  });

  it("shows nothing for it when the deck has been deleted", async () => {
    await seed("Ruy Lopez", "1. e4 e5");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    expect(screen.queryByRole("region", { name: "Difficult moves" })).not.toBeInTheDocument();
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
    const [first] = cardRows();
    await fromCardMenu("Mark as difficult", first);
    expect(await screen.findByText("Added to Difficult moves.")).toBeInTheDocument();
    await fromCardMenu("Mark as difficult", first);
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
    await screen.findAllByRole("button", { name: "Open" });
    const rows = cardRows();
    expect(within(rows[0]).getByText("Gave trouble 2 times")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Gave trouble once")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /^More options for/ })[0]);
    expect(screen.queryByRole("menuitem", { name: "Mark as difficult" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Delete"]);
  });

  it("deletes a card from it with the usual question, leaving the original", async () => {
    const id = await seed("Ruy Lopez", "1. e4 e5");
    const [card] = await listCards(id);
    await markDifficult(card);
    const deck = await difficult();
    renderPage(`/decks?deck=${deck.id}`);
    await screen.findByRole("heading", { level: 1, name: "Difficult moves" });
    await screen.findAllByRole("button", { name: "Open" });
    await fromCardMenu("Delete");
    await click("Delete card");
    await waitFor(async () => expect(await listCards(deck.id)).toHaveLength(0));
    expect(await listCards(id)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Progress: what is due, and what each card's schedule looks like.

const gradeInput = (card: Awaited<ReturnType<typeof listCards>>[number], now: number) => ({
  card,
  grade: "good" as const,
  suggested: "good" as const,
  nudged: false,
  outcome: "first-try" as const,
  tally: { mistakes: 0, hintUsed: false, revealed: false, played: 1 },
  playerMoves: 1,
  timing: { shownAt: 0, firstMoveAt: 1, completedAt: 2, elapsedMs: 4200, activeMs: 4200, idleMs: 0, hiddenMs: 0, firstMoveActiveMs: 1, flags: [], reliable: true },
  desiredRetention: 0.9,
  now,
});

describe("Decks page: what is due", () => {
  it("shows new cards on the tile, then due ones once their day comes", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    const { recordReview } = await import("../../data/progress");
    const [first] = await listCards(id);
    renderPage();
    await screen.findByRole("heading", { name: "Open" });
    expect(await screen.findByText("2 new")).toBeInTheDocument();

    await recordReview(gradeInput(first, Date.now() - 40 * 86_400_000));
    expect(await screen.findByText("1 due, 1 new")).toBeInTheDocument();
  });

  it("says nothing is due when every card is waiting", async () => {
    const id = await seed("Open", "1. e4 e5");
    const { recordReview } = await import("../../data/progress");
    const [only] = await listCards(id);
    await recordReview(gradeInput(only, Date.now()));
    renderPage();
    expect(await screen.findByText("Nothing due")).toBeInTheDocument();
  });

  it("marks each card as new or says when it is due, and shows its progress when opened", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    const { recordReview } = await import("../../data/progress");
    const [first] = await listCards(id);
    await recordReview(gradeInput(first, Date.now()));
    await openDeck(id, "Open");
    await screen.findAllByText("New.");
    const rows = cardRows();
    expect(rows.filter((row) => within(row).queryByText("New."))).toHaveLength(1);
    const graded = rows.find((row) => within(row).queryByText(/^Due /));
    if (!graded) throw new Error("graded card row not found");

    await userEvent.click(within(graded).getByRole("button", { name: "Open" }));
    const progress = within(within(graded).getByRole("region", { name: "Progress" }));
    expect(progress.getByText("1 review")).toBeInTheDocument();
    expect(progress.getByText("Recall chance now")).toBeInTheDocument();
    expect(await progress.findByRole("table")).toBeInTheDocument();
    expect(progress.getByText("Right first time")).toBeInTheDocument();
    expect(progress.getByText("4 s")).toBeInTheDocument();
    expect(progress.getByText("Good")).toBeInTheDocument();
  });

  it("says a card that hasn't been studied is new", async () => {
    const id = await seed("Open", "1. e4 e5");
    await openDeck(id, "Open");
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("Not studied yet. It is new.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset progress" })).not.toBeInTheDocument();
  });

  it("resets a card's progress after asking, which makes it new again", async () => {
    const id = await seed("Open", "1. e4 e5");
    const { recordReview } = await import("../../data/progress");
    const [only] = await listCards(id);
    await recordReview(gradeInput(only, Date.now()));
    await openDeck(id, "Open");
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset progress" }));
    expect(screen.getByText(/It becomes a new card again, and its history is deleted/)).toBeInTheDocument();
    expect(await db.schedules.count()).toBe(1);
    const buttons = screen.getAllByRole("button", { name: "Reset progress" });
    await userEvent.click(buttons[buttons.length - 1]);
    expect(await screen.findByText("Not studied yet. It is new.")).toBeInTheDocument();
    expect(await db.schedules.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });

  it("keeps the progress when you decide not to reset", async () => {
    const id = await seed("Open", "1. e4 e5");
    const { recordReview } = await import("../../data/progress");
    const [only] = await listCards(id);
    await recordReview(gradeInput(only, Date.now()));
    await openDeck(id, "Open");
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset progress" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(await db.schedules.count()).toBe(1);
  });
});

describe("Decks page: Start learning & review", () => {
  it("shows how much is due and how many new cards can come in, and links to the combined session", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    const { recordReview } = await import("../../data/progress");
    const [first] = await listCards(id);
    await recordReview(gradeInput(first, Date.now() - 40 * 86_400_000));
    renderPage();
    const link = await screen.findByRole("link", { name: /start learning & review/i });
    expect(link).toHaveAttribute("href", "/review?all=1");
    expect(await screen.findByText("1 due, 2 new")).toBeInTheDocument();
  });

  it("limits the new cards it counts to the daily limit", async () => {
    const { saveSettings } = await import("../../data/progress");
    await saveSettings({ newPerDay: 5 });
    await seed("Long", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6");
    renderPage();
    expect(await screen.findByText("5 new")).toBeInTheDocument();
  });

  it("isn't shown when there are no decks", async () => {
    renderPage();
    await screen.findByText(/You have no decks yet/);
    expect(screen.queryByRole("link", { name: /start learning & review/i })).not.toBeInTheDocument();
  });
});

async function gradeCard(cardId: string, scheduledDays: number, due: number, state: 1 | 2 = 2) {
  const card = await db.cards.get(cardId);
  if (!card) throw new Error("no card");
  await db.schedules.put({ cardId, deckId: card.deckId, due, stability: 1, difficulty: 1, scheduledDays, learningSteps: 0, reps: 1, lapses: 0, state, lastReview: 0 });
}

describe("Decks page: the New deck and Make cards tile", () => {
  it("shows New deck and a Make cards link side by side, both always there", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    expect(screen.getByRole("button", { name: /New deck/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Make cards/ })).toHaveAttribute("href", "/create");
  });

  it("swaps both for the form while naming a deck, and brings them back after", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    await click(/New deck/);
    expect(screen.getByLabelText("Name your deck")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Make cards/ })).not.toBeInTheDocument();
    await click("Cancel");
    expect(screen.getByRole("link", { name: /Make cards/ })).toBeInTheDocument();
  });
});

describe("Decks page: counts and filters inside a deck", () => {
  async function graded() {
    const id = await seed("Mixed", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    const cards = await listCards(id);
    const future = Date.now() + 40 * 86_400_000;
    await gradeCard(cards[0].id, 2, 1); // learning, due
    await gradeCard(cards[1].id, 30, future); // mastered
    return { id, cards };
  }

  it("shows new, learning, mastered and due counts", async () => {
    const { id } = await graded();
    await openDeck(id, "Mixed");
    const group = screen.getByRole("group", { name: "Cards by status" });
    const count = (label: string) => within(group).getByRole("button", { name: new RegExp(label) }).textContent;
    expect(count("New")).toBe("1New");
    expect(count("Learning")).toBe("1Learning");
    expect(count("Mastered")).toBe("1Mastered");
    expect(count("Due")).toBe("1Due");
  });

  it("filters the cards by a status, and clears it when pressed again", async () => {
    const { id } = await graded();
    await openDeck(id, "Mixed");
    expect(cardRows()).toHaveLength(3);
    await click(/^1Mastered$/);
    expect(cardRows()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^1Mastered$/ })).toHaveAttribute("aria-pressed", "true");
    await click(/^1Mastered$/);
    expect(cardRows()).toHaveLength(3);
    await click(/^1New$/);
    expect(cardRows()).toHaveLength(1);
  });

  it("says when nothing matches and offers to clear the search", async () => {
    const { id } = await graded();
    await openDeck(id, "Mixed");
    await userEvent.type(screen.getByLabelText("Search this deck"), "zzzz");
    expect(await screen.findByText(/No cards match/)).toBeInTheDocument();
    await click("Clear the search");
    expect(cardRows()).toHaveLength(3);
    expect(screen.getByLabelText("Search this deck")).toHaveValue("");
  });

  it("searches inside the deck by a move", async () => {
    const id = await seed("Mixed", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    await openDeck(id, "Mixed");
    await userEvent.type(screen.getByLabelText("Search this deck"), "Bb5");
    await waitFor(() => expect(cardRows()).toHaveLength(1));
  });

  it("filters by a tag chip, and only shows chips for tags the deck uses", async () => {
    const id = await seed("Tagged", "1. e4 e5 2. Nf3 Nc6");
    const cards = await listCards(id);
    await db.cards.update(cards[0].id, { tags: ["Kings pawn"] });
    await openDeck(id, "Tagged");
    const chips = screen.getByRole("group", { name: "Tags" });
    expect(within(chips).getAllByRole("button")).toHaveLength(1);
    await userEvent.click(within(chips).getByRole("button", { name: "Kings pawn" }));
    expect(cardRows()).toHaveLength(1);
    await userEvent.click(within(chips).getByRole("button", { name: "Kings pawn" }));
    expect(cardRows()).toHaveLength(2);
  });
});

describe("Decks page: searching every deck", () => {
  it("lists matching cards from all decks, each linking to its deck, and hides the grid while searching", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    const queens = await seed("Queen's Gambit", "1. d4 d5 2. c4");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    await userEvent.type(screen.getByLabelText("Search all cards"), "c4");
    const results = await screen.findByRole("region", { name: "Search results" });
    const links = within(results).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toMatch(new RegExp(`^/decks\\?deck=${queens}&card=`));
    expect(within(results).getByText(/Queen's Gambit/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review Ruy Lopez" })).not.toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3");
    renderPage();
    await screen.findByRole("heading", { name: "Ruy Lopez" });
    await userEvent.type(screen.getByLabelText("Search all cards"), "zzzz");
    expect(await screen.findByText("No cards match.")).toBeInTheDocument();
  });

  it("opens the card a result pointed at", async () => {
    const id = await seed("Ruy Lopez", "1. e4 e5 2. Nf3 Nc6");
    const cards = await listCards(id);
    renderPage(`/decks?deck=${id}&card=${cards[1].id}`);
    await screen.findAllByRole("button", { name: "Open" });
    await waitFor(() => expect(document.getElementById(`card-${cards[1].id}`)).toBeInTheDocument());
  });
});

describe("Decks page: moving a card", () => {
  it("moves a card to another deck, with its progress, and takes it off this deck's list", async () => {
    const from = await seed("From", "1. e4 e5 2. Nf3");
    const to = await createDeck("To");
    if (!to.ok) throw new Error(to.error);
    const [card] = await listCards(from);
    await gradeCard(card.id, 2, 1);
    await openDeck(from, "From");
    await fromCardMenu("Move to another deck");
    await userEvent.selectOptions(screen.getByLabelText("Move to"), to.deck.id);
    await click("Move card");
    await waitFor(async () => expect((await db.cards.get(card.id))?.deckId).toBe(to.deck.id));
    expect((await db.schedules.get(card.id))?.deckId).toBe(to.deck.id);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(1));
  });

  it("can be cancelled without moving anything", async () => {
    const from = await seed("From", "1. e4 e5 2. Nf3");
    await createDeck("To");
    await openDeck(from, "From");
    await fromCardMenu("Move to another deck");
    await click("Cancel");
    expect(screen.queryByLabelText("Move to")).not.toBeInTheDocument();
    expect(await listCards(from)).toHaveLength(2);
  });

  it("shows an error when the other deck already has the card", async () => {
    const from = await seed("From", "1. e4 e5 2. Nf3");
    const to = await seed("To", "1. e4 e5 2. Nf3");
    await openDeck(from, "From");
    await fromCardMenu("Move to another deck");
    await userEvent.selectOptions(screen.getByLabelText("Move to"), to);
    await click("Move card");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already has a card/);
  });

  it("doesn't offer the move on the Difficult moves deck", async () => {
    const id = await seed("From", "1. e4 e5 2. Nf3");
    const [card] = await listCards(id);
    await installDifficultDeckOnce();
    await markDifficult(card);
    const hard = (await listDecks()).find((deck) => deck.theme === "difficult");
    if (!hard) throw new Error("no difficult deck");
    await openDeck(hard.id, "Difficult moves");
    await userEvent.click(screen.getAllByRole("button", { name: /^More options for/ })[0]);
    expect(screen.queryByRole("menuitem", { name: "Move to another deck" })).not.toBeInTheDocument();
  });
});

describe("Decks page: exporting a deck", () => {
  it("downloads the deck as a backup file", async () => {
    const id = await seed("Ruy Lopez", "1. e4 e5 2. Nf3");
    const saved: { name: string; text: string }[] = [];
    const download = await import("../../data/download");
    const spy = vi.spyOn(download, "downloadText").mockImplementation((name, text) => void saved.push({ name, text }));
    await openDeck(id, "Ruy Lopez");
    await click("Export deck");
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toMatch(/^rockchess-deck-ruy-lopez-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(saved[0].text)).toMatchObject({ app: "rockchess", scope: "deck" });
    spy.mockRestore();
  });
});
