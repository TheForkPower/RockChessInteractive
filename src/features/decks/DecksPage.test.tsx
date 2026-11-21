import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../data/db";
import { addCards, createDeck, listCards, listDecks } from "../../data/repo";
import { buildDeckCards } from "../../domain/cards";
import { START_FEN } from "../../domain/fen";
import { parseMovetext } from "../../domain/pgn";
import { installTutorialDeckOnce } from "../../data/seed";

vi.mock("../../board/Board", async () => await import("../../test/boardMock"));

import { DecksPage } from "./DecksPage";

const click = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));

/** Waits for the deck's heading and its cards. */
async function ready(name: string) {
  await screen.findByRole("heading", { name });
  await screen.findAllByRole("button", { name: "Open" });
}

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

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("Decks page", () => {
  it("points to Create when there are no decks", async () => {
    renderPage();
    expect(await screen.findByText(/You have no decks yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create cards" })).toHaveAttribute("href", "/create");
  });

  it("lists decks with their card counts and the first deck's cards", async () => {
    await seed("Ruy Lopez", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    await seed("Queen's Gambit", "1. d4 d5 2. c4");
    renderPage();
    const decks = within(await screen.findByRole("navigation", { name: "Decks" }));
    expect(decks.getByRole("button", { name: /Queen's Gambit/ })).toHaveTextContent("2");
    expect(decks.getByRole("button", { name: /Ruy Lopez/ })).toHaveTextContent("3");
    // Decks are sorted by name, so the first is Queen's Gambit.
    await ready("Queen's Gambit");
    expect(screen.getAllByText("Answer: 1. d4")).toHaveLength(1);
  });

  it("switches decks", async () => {
    await seed("Alpha", "1. e4 e5");
    await seed("Beta", "1. d4 d5");
    renderPage();
    await ready("Alpha");
    await click(/Beta/);
    await ready("Beta");
    expect(screen.getByText("Answer: 1. d4")).toBeInTheDocument();
  });

  it("opens the deck named in the address", async () => {
    await seed("Alpha", "1. e4 e5");
    const id = await seed("Beta", "1. d4 d5");
    renderPage(`/decks?deck=${id}`);
    expect(await screen.findByRole("heading", { name: "Beta" })).toBeInTheDocument();
  });

  it("opens a card to show its explanation and clickable continuation, variations included", async () => {
    await seed("Open", "1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6");
    renderPage();
    await ready("Open");
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
    renderPage();
    await ready("Open");
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
    renderPage();
    await ready("Open");
    await click("Edit");
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "e5" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't a legal move/);
    await click("Save changes");
    expect((await listCards(id))[0].answer[0].san).toBe("e4");
  });

  it("cancels an edit", async () => {
    await seed("Open", "1. e4 e5");
    renderPage();
    await ready("Open");
    await click("Edit");
    await click("Cancel");
    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument();
  });

  it("asks before deleting a card", async () => {
    const id = await seed("Open", "1. e4 e5 2. Nf3");
    renderPage();
    await ready("Open");
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
    await seed("Alpha", "1. e4 e5");
    await seed("Beta", "1. d4 d5");
    renderPage();
    await ready("Alpha");
    await click("Rename");
    fireEvent.change(screen.getByLabelText("Deck name"), { target: { value: "beta" } });
    await click("Save name");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already have a deck called "Beta"/);
    fireEvent.change(screen.getByLabelText("Deck name"), { target: { value: "Aardvark" } });
    await click("Save name");
    expect(await screen.findByRole("heading", { name: "Aardvark" })).toBeInTheDocument();
    expect((await listDecks()).map((deck) => deck.name)).toEqual(["Aardvark", "Beta"]);
  });

  it("asks before deleting a deck and its cards", async () => {
    await seed("Alpha", "1. e4 e5 2. Nf3");
    renderPage();
    await ready("Alpha");
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
  it("shows the Famous moves deck with its banner and cards", async () => {
    await installTutorialDeckOnce();
    renderPage();
    const heading = await screen.findByRole("heading", { name: "Famous moves" });
    expect(heading.parentElement).toHaveTextContent("Starter deck");
    expect(heading.parentElement).toHaveTextContent("10 cards");
    expect(await screen.findAllByRole("button", { name: "Open" })).toHaveLength(10);
    expect(screen.getByText("White to move. Play a good first move.")).toBeInTheDocument();
  });

  it("opens a starter card like any other", async () => {
    await installTutorialDeckOnce();
    renderPage();
    await ready("Famous moves");
    await userEvent.click(screen.getAllByRole("button", { name: "Open" })[1]);
    expect(screen.getAllByText(/Nxe5/).length).toBeGreaterThan(0);
  });

  it("offers to add the starter deck back after it is deleted, and does", async () => {
    await installTutorialDeckOnce();
    renderPage();
    await ready("Famous moves");
    await click("Delete deck");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete deck" })[1]); // confirm
    await screen.findByText(/You have no decks yet/);
    await click("Add the Famous moves deck");
    await ready("Famous moves");
    expect((await listDecks())[0].theme).toBe("tutorial");
  });

  it("hides the add button while the deck is there", async () => {
    await installTutorialDeckOnce();
    renderPage();
    await ready("Famous moves");
    expect(screen.queryByRole("button", { name: "Add the Famous moves deck" })).not.toBeInTheDocument();
  });
});
