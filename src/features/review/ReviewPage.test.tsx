import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../data/db";
import { addCards, createDeck, listCards, listDecks } from "../../data/repo";
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

/** Drops a move, trying again until the board has taken its latest props. */
const play = (move: Parameters<typeof dropMove>[0]) => waitFor(() => expect(dropMove(move)).toBe(true));

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
    expect(await screen.findByRole("heading", { level: 2, name: "White to move" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Review: Openings" })).toBeInTheDocument();
    expect(screen.getByText("Card 1 of 1")).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(board()).toHaveAttribute("data-interactive", "turn");
    expect(screen.queryByRole("button", { name: "1. e4" })).not.toBeInTheDocument();
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
    await screen.findByRole("heading", { level: 2, name: "White to move" });
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
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    dropMove({ from: "e2", to: "e4" });
    expect((await screen.findAllByRole("button", { name: "1. e4" })).length).toBeGreaterThan(0);
    expect(screen.getByText("It takes the centre.")).toBeInTheDocument();
    expect(screen.getByText("Most popular first move.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Continuation viewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See results" })).toBeInTheDocument();
  });

  it("only offers Show answer after a move has been tried", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    const show = screen.getByRole("button", { name: "Show answer" });
    expect(show).toHaveAttribute("aria-disabled", "true");
    expect(show).toHaveAccessibleDescription(/Make a move first/);
    dropMove({ from: "a2", to: "a3" });
    expect(screen.getByRole("button", { name: "Show answer" })).not.toHaveAttribute("aria-disabled");
    await click("Show answer");
    expect(await screen.findByText("Here's the answer")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "1. e4" }).length).toBeGreaterThan(0);
  });

  it("shows a hint only when asked, and only if the card has one", async () => {
    const [plain] = drafts("1. e4 e5", "moves");
    const id = await makeDeck("Openings", [{ ...plain, hint: "Open the centre." }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
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
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    expect(screen.queryByRole("button", { name: "Hint" })).not.toBeInTheDocument();
  });

  it("accepts another move the card lists, and says so", async () => {
    const [plain] = drafts("1. e4 e5", "moves");
    const id = await makeDeck("Openings", [{ ...plain, alternatives: [{ from: "d2", to: "d4", san: "d4" }] }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
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
    const answer = within(screen.getByRole("region", { name: "Answer line" }));
    expect(answer.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "1. e4",
      "1... e5",
      "2. Nf3",
      "2... Nc6",
    ]);
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
    expect(screen.getByText(/aren't scheduled yet/)).toBeInTheDocument();
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
    expect(screen.getAllByRole("button", { name: "1. e4" }).length).toBeGreaterThan(0);
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

describe("The card's layout", () => {
  it("puts the side to move in the big heading and the rest of the question smaller", async () => {
    const [card] = drafts("1. e4 e5", "moves");
    const id = await makeDeck("Layout", [{ ...card, prompt: "White to move. Both rooks are attacked. Find the quiet move." }]);
    renderReview(`?deck=${id}`);
    const heading = await screen.findByRole("heading", { level: 2, name: "White to move" });
    expect(heading).toHaveClass("text-4xl");
    const detail = screen.getByText("Both rooks are attacked. Find the quiet move.");
    expect(detail).toHaveClass("text-lg");
    expect(heading.textContent).not.toContain("rooks");
  });

  it("lets you click moves in the answer and in the explanation to show them on the board", async () => {
    const [card] = drafts("1. e4 e5 2. Nf3 Nc6", "moves");
    const id = await makeDeck("Clickable", [{ ...card, explanation: "After 1. e4 e5 2. Nf3 Nc6 White develops. The knight on f3 hits e5." }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    await play({ from: "e2", to: "e4" });
    const why = within(await screen.findByRole("region", { name: "Why" }, { timeout: 4000 }));
    await userEvent.click(why.getByRole("button", { name: "2. Nf3" }));
    expect(board()).toHaveAttribute("data-fen", "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2");
    expect(why.getByRole("button", { name: "2. Nf3" })).toHaveAttribute("aria-current", "true");
    // The squares named in the sentence are not made into buttons.
    expect(why.queryByRole("button", { name: /f3$/ })).toBeInTheDocument();
    expect(why.getAllByRole("button")).toHaveLength(4);

    const answer = within(screen.getByRole("region", { name: "Answer" }));
    await userEvent.click(answer.getByRole("button", { name: "1. e4" }));
    expect(board()).toHaveAttribute("data-fen", "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  });

  it("reads an explanation written with PGN syntax", async () => {
    const [card] = drafts("1. e4 e5 2. Nf3 Nc6", "moves");
    const id = await makeDeck("Pgn style", [{ ...card, explanation: "1. e4 $1 {Takes the centre.} 1... e5 2. Nf3" }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    await play({ from: "e2", to: "e4" });
    const why = within(await screen.findByRole("region", { name: "Why" }, { timeout: 4000 }));
    expect(why.getAllByRole("button").map((button) => button.textContent)).toEqual(["1. e4", "1... e5", "2. Nf3"]);
    expect(screen.queryByText(/\{/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$1/)).not.toBeInTheDocument();
  });

  it("lists every move beside the card instead of under the board", async () => {
    const id = await makeDeck("Side", drafts("1. e4 e5 2. Nf3 Nc6", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    await play({ from: "e2", to: "e4" });
    const moves = within(await screen.findByRole("region", { name: "All the moves" }, { timeout: 4000 }));
    await userEvent.click(moves.getByRole("button", { name: "2... Nc6" }));
    expect(board()).toHaveAttribute("data-fen", expect.stringContaining("r1bqkbnr/pppp1ppp/2n5"));
    // The board column has the arrows but no list of moves of its own.
    expect(screen.queryByRole("group", { name: "Continuation" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Step through the moves" })).toBeInTheDocument();
  });

  it("puts the next-card button above the explanation", async () => {
    const [card] = drafts("1. e4 e5", "moves");
    const id = await makeDeck("Order", [{ ...card, explanation: "Because." }]);
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    await play({ from: "e2", to: "e4" });
    const next = await screen.findByRole("button", { name: "See results" }, { timeout: 4000 });
    const why = screen.getByRole("region", { name: "Why" });
    expect(next.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Review: the Difficult moves deck", () => {
  const difficultDeck = async () => (await listDecks()).find((deck) => deck.theme === "difficult");

  it("copies a card into Difficult moves when you needed the answer", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    dropMove({ from: "a2", to: "a3" });
    await click("Show answer");
    await waitFor(async () => expect(await difficultDeck()).toBeDefined());
    const deck = await difficultDeck();
    const cards = await listCards(deck!.id);
    expect(cards).toHaveLength(1);
    expect(cards[0].struggles).toBe(1);
    expect(cards[0].sourceCardId).toBeTruthy();
    // The original stays where it was.
    expect(await listCards(id)).toHaveLength(1);
  });

  it("copies a card after two wrong moves, even when the third is right", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    dropMove({ from: "a2", to: "a3" });
    dropMove({ from: "b2", to: "b3" });
    await play({ from: "e2", to: "e4" });
    await screen.findByRole("button", { name: "See results" });
    await waitFor(async () => expect(await difficultDeck()).toBeDefined());
  });

  it("does not add a card that was only missed once", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    dropMove({ from: "a2", to: "a3" });
    await play({ from: "e2", to: "e4" });
    await screen.findByRole("button", { name: "See results" });
    expect(await difficultDeck()).toBeUndefined();
  });

  it("lets you mark a card as difficult from the back of the card", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    await play({ from: "e2", to: "e4" });
    await click("Mark as difficult");
    expect(await screen.findByText("Added to Difficult moves.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as difficult" })).toHaveAttribute("aria-disabled", "true");
    const deck = await difficultDeck();
    expect(await listCards(deck!.id)).toHaveLength(1);
  });

  it("practises the hardest cards first and doesn't offer to mark a card that is already there", async () => {
    const id = await makeDeck("Openings", [...drafts("1. e4 e5", "moves"), ...drafts("1. d4 d5", "moves")]);
    const { recordStruggle } = await import("../../data/difficult");
    const [first, second] = await listCards(id);
    await recordStruggle(first);
    await recordStruggle(second);
    await recordStruggle(second);
    const deck = await difficultDeck();
    renderReview(`?deck=${deck!.id}`);
    await screen.findByText("Card 1 of 2");
    dropMove({ from: "d2", to: "d4" });
    expect(await screen.findByRole("button", { name: "Next card" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as difficult" })).not.toBeInTheDocument();
  });
});
