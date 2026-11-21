import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../data/db";
import { addCards, createDeck } from "../../data/repo";
import { buildDeckCards, type CardDraft } from "../../domain/cards";
import { START_FEN } from "../../domain/fen";
import { parseMovetext } from "../../domain/pgn";
import { boardProps, dropMove } from "../../test/boardMock";

vi.mock("../../board/Board", async () => await import("../../test/boardMock"));

import { ReviewPage } from "./ReviewPage";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function drafts(text: string, shape: "moves" | "line", side: "w" | "b" = "w"): CardDraft[] {
  const parsed = parseMovetext(text, START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const built = buildDeckCards(parsed.tree, { side, shape, context: "rest" });
  if (!built.ok) throw new Error(built.error);
  return built.drafts;
}

async function makeDeck(name: string, cards: CardDraft[]) {
  const made = await createDeck(name);
  if (!made.ok) throw new Error(made.error);
  if (cards.length > 0) await addCards(made.deck.id, cards);
  return made.deck.id;
}

function renderReview(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/review${query}`]}>
      <Routes>
        <Route path="/review" element={<ReviewPage replyDelay={0} />} />
        <Route path="/decks" element={<p>The decks page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const board = () => screen.getByTestId("board");
const click = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));

beforeEach(async () => {
  boardProps.current = null;
  await db.delete();
  await db.open();
});

describe("Review: a single-move card", () => {
  it("asks the question on a board you can move on, and doesn't show the answer", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    expect(await screen.findByRole("heading", { level: 2, name: "White to move." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Review: Openings" })).toBeInTheDocument();
    expect(screen.getByText("Card 1 of 1")).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(board()).toHaveAttribute("data-interactive", "turn");
    expect(screen.queryByText("1. e4")).not.toBeInTheDocument();
    expect(screen.getByText(/Play your answer on the board/)).toBeInTheDocument();
  });

  it("turns the board to the side you play", async () => {
    const id = await makeDeck("Black", drafts("1. e4 e5 2. Nf3", "moves", "b"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2 });
    expect(board()).toHaveAttribute("data-orientation", "b");
  });

  it("refuses a wrong move and lets you try again", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move." });
    expect(dropMove({ from: "d2", to: "d4" })).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Not quite");
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(dropMove({ from: "e2", to: "e4" })).toBe(true);
    expect(await screen.findByText("You found it")).toBeInTheDocument();
  });

  it("shows the answer, the explanation and the moves after a right answer", async () => {
    const [card] = drafts("1. e4 e5 2. Nf3", "moves");
    const id = await makeDeck("Openings", [{ ...card, explanation: "It takes the centre.", notes: "Most popular first move." }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move." });
    dropMove({ from: "e2", to: "e4" });
    expect(await screen.findByText("1. e4")).toBeInTheDocument();
    expect(screen.getByText("It takes the centre.")).toBeInTheDocument();
    expect(screen.getByText("Most popular first move.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Continuation viewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See results" })).toBeInTheDocument();
  });

  it("only offers Show answer after a move has been tried", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move." });
    const show = screen.getByRole("button", { name: "Show answer" });
    expect(show).toHaveAttribute("aria-disabled", "true");
    expect(show).toHaveAccessibleDescription(/Make a move first/);
    dropMove({ from: "a2", to: "a3" });
    expect(screen.getByRole("button", { name: "Show answer" })).not.toHaveAttribute("aria-disabled");
    await click("Show answer");
    expect(await screen.findByText("Here's the answer")).toBeInTheDocument();
    expect(screen.getByText("1. e4")).toBeInTheDocument();
  });

  it("shows a hint only when asked, and only if the card has one", async () => {
    const [plain] = drafts("1. e4 e5", "moves");
    const id = await makeDeck("Openings", [{ ...plain, hint: "Open the centre." }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move." });
    expect(screen.queryByText(/Open the centre/)).not.toBeInTheDocument();
    await click("Hint");
    expect(screen.getByText(/Open the centre/)).toBeInTheDocument();
    await click("Hide hint");
    expect(screen.queryByText(/Open the centre/)).not.toBeInTheDocument();
  });

  it("has no hint button when the card has no hint", async () => {
    const [plain] = drafts("1. e4 e5", "moves");
    const id = await makeDeck("Openings", [{ ...plain, hint: "" }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move." });
    expect(screen.queryByRole("button", { name: "Hint" })).not.toBeInTheDocument();
  });

  it("accepts another move the card lists, and says so", async () => {
    const [plain] = drafts("1. e4 e5", "moves");
    const id = await makeDeck("Openings", [{ ...plain, alternatives: [{ from: "d2", to: "d4", san: "d4" }] }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move." });
    expect(dropMove({ from: "d2", to: "d4" })).toBe(true);
    expect(await screen.findByText(/d4 is saved on this card as another accepted move/)).toBeInTheDocument();
    expect(screen.getByText(/Also accepted:/)).toBeInTheDocument();
  });
});

describe("Review: a line card", () => {
  const line = () => drafts("1. e4 e5 2. Nf3 Nc6", "line");

  it("plays the opponent's replies for you, and finishes after the last move", async () => {
    const id = await makeDeck("Lines", line());
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2 });
    expect(dropMove({ from: "e2", to: "e4" })).toBe(true);
    await waitFor(() => expect(board()).toHaveAttribute("data-fen", expect.stringContaining("4p3/4P3")));
    expect(await screen.findByText("Now find the next move")).toBeInTheDocument();
    expect(dropMove({ from: "g1", to: "f3" })).toBe(true);
    expect(await screen.findByText("Correct")).toBeInTheDocument();
    expect(screen.getByText("1. e4 e5 2. Nf3 Nc6")).toBeInTheDocument();
  });

  it("says when the first move was right but a later one wasn't", async () => {
    const id = await makeDeck("Lines", line());
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2 });
    dropMove({ from: "e2", to: "e4" });
    await screen.findByText("Now find the next move");
    expect(dropMove({ from: "b1", to: "c3" })).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(/moves so far are right/);
  });

  it("calls it part right when you give up part way", async () => {
    const id = await makeDeck("Lines", line());
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2 });
    dropMove({ from: "e2", to: "e4" });
    await screen.findByText("Now find the next move");
    dropMove({ from: "b1", to: "c3" });
    await click("Show answer");
    expect(await screen.findByText("Part of it right")).toBeInTheDocument();
    expect(screen.getByText(/Your first move was right/)).toBeInTheDocument();
  });

  it("plays the opponent's first move itself when you are Black", async () => {
    const id = await makeDeck("Black lines", drafts("1. e4 e5 2. Nf3 Nc6", "line", "b"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2 });
    await waitFor(() => expect(board()).toHaveAttribute("data-fen", AFTER_E4));
    expect(dropMove({ from: "e7", to: "e5" })).toBe(true);
  });
});

describe("Review: a session of several cards", () => {
  const two = () => [...drafts("1. e4 e5", "moves"), ...drafts("1. d4 d5", "moves")];

  it("goes through the cards, then shows how it went", async () => {
    const id = await makeDeck("Two", two());
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 2");
    dropMove({ from: "e2", to: "e4" });
    await click("Next card");
    expect(await screen.findByText("Card 2 of 2")).toBeInTheDocument();
    dropMove({ from: "a2", to: "a3" });
    await click("Show answer");
    await click("See results");
    expect(await screen.findByRole("heading", { name: "You went through 2 cards" })).toBeInTheDocument();
    expect(screen.getByText("Right first time")).toBeInTheDocument();
    expect(screen.getAllByText("Answer shown")).toHaveLength(2); // in the totals, and in the list to look at again
    const another = within(screen.getByRole("region", { name: "Worth another look" }));
    expect(another.getByText("White to move.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to decks" })).toHaveAttribute("href", "/decks");
    expect(screen.getByText(/aren't saved or scheduled yet/)).toBeInTheDocument();
  });

  it("starts over with Review again", async () => {
    const id = await makeDeck("One", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    dropMove({ from: "e2", to: "e4" });
    await click("See results");
    await click("Review again");
    expect(await screen.findByText("Card 1 of 1")).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("counts the first go at a card, not a retry", async () => {
    const id = await makeDeck("One", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    dropMove({ from: "a2", to: "a3" });
    await click("Show answer");
    await click("Try this card again");
    await screen.findByText(/Play your answer on the board/);
    dropMove({ from: "e2", to: "e4" });
    await click("See results");
    expect((await screen.findAllByText("Answer shown")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Right first time")).not.toBeInTheDocument();
  });

  it("ends early and says how many cards weren't reached", async () => {
    const id = await makeDeck("Two", two());
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 2");
    dropMove({ from: "e2", to: "e4" });
    await click("End session");
    expect(await screen.findByRole("heading", { name: "You went through 1 card" })).toBeInTheDocument();
    expect(screen.getByText("1 card was not reached.")).toBeInTheDocument();
  });

  it("ends with nothing played", async () => {
    const id = await makeDeck("Two", two());
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 2");
    await click("End session");
    expect(await screen.findByRole("heading", { name: "Session ended" })).toBeInTheDocument();
    expect(screen.getByText("2 cards were not reached.")).toBeInTheDocument();
  });
});

describe("Learn mode", () => {
  it("shows the answer first, then asks for it from memory", async () => {
    const [card] = drafts("1. e4 e5 2. Nf3", "moves");
    const id = await makeDeck("Learn me", [{ ...card, explanation: "It takes the centre." }]);
    renderReview(`?deck=${id}&mode=learn`);
    expect(await screen.findByRole("heading", { level: 1, name: "Learn: Learn me" })).toBeInTheDocument();
    expect(await screen.findByText("Study this card")).toBeInTheDocument();
    expect(screen.getByText("1. e4")).toBeInTheDocument();
    expect(screen.getByText("It takes the centre.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Continuation viewer" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Play it from memory" }));
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(board()).toHaveAttribute("data-interactive", "turn");
    expect(screen.queryByText("It takes the centre.")).not.toBeInTheDocument();
    expect(dropMove({ from: "e2", to: "e4" })).toBe(true);
    expect(await screen.findByText("Correct")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See results" })).toBeInTheDocument();
  });

  it("jumps straight to the question when you try a card again", async () => {
    const id = await makeDeck("Learn me", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}&mode=learn`);
    await userEvent.click(await screen.findByRole("button", { name: "Play it from memory" }));
    dropMove({ from: "e2", to: "e4" });
    await click("Try this card again");
    expect(await screen.findByText(/Play your answer on the board/)).toBeInTheDocument();
  });

  it("plays the opponent's first move after you start from memory", async () => {
    const id = await makeDeck("Black", drafts("1. e4 e5 2. Nf3 Nc6", "line", "b"));
    renderReview(`?deck=${id}&mode=learn`);
    await userEvent.click(await screen.findByRole("button", { name: "Play it from memory" }));
    await waitFor(() => expect(board()).toHaveAttribute("data-fen", AFTER_E4));
  });
});

describe("Review: when there is nothing to play", () => {
  it("sends you to the decks page when no deck is named", async () => {
    renderReview("");
    expect(await screen.findByText("The decks page")).toBeInTheDocument();
  });

  it("says so when the deck is gone", async () => {
    renderReview("?deck=nope");
    expect(await screen.findByText(/That deck isn't here any more/)).toBeInTheDocument();
  });

  it("says so when the deck has no cards", async () => {
    const id = await makeDeck("Empty", []);
    renderReview(`?deck=${id}`);
    expect(await screen.findByText(/This deck has no cards to review/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Make some on the Create page/ })).toHaveAttribute("href", "/create");
  });
});
