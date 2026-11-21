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

/** Most tests play in practice mode, where nothing is graded or saved. Pass `scheduled` for the real thing. */
function renderReview(query: string, { scheduled = false, clock }: { scheduled?: boolean; clock?: () => number } = {}) {
  const address = scheduled || !query.includes("deck=") ? query : `${query}&practice=1`;
  return render(
    <MemoryRouter initialEntries={[`/review${address}`]}>
      <Routes>
        <Route path="/review" element={<ReviewPage replyDelay={0} clock={clock} />} />
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
    expect(screen.getByRole("heading", { level: 1, name: "Practise: Openings" })).toBeInTheDocument();
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
    const answer = within(await screen.findByRole("region", { name: "Answer line" }));
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
  });

  it("starts over with Practise again", async () => {
    const id = await makeDeck("One", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    dropMove({ from: "e2", to: "e4" });
    await click("See results");
    await click("Practise again");
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
    expect(await screen.findByRole("heading", { level: 1, name: "Practise: Learn me" })).toBeInTheDocument();
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

  it("has no separate list of all the moves, and keeps the arrows under the board", async () => {
    const id = await makeDeck("Side", drafts("1. e4 e5 2. Nf3 Nc6", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    await play({ from: "e2", to: "e4" });
    await screen.findByRole("region", { name: "Answer" }, { timeout: 4000 });
    expect(screen.queryByRole("region", { name: "All the moves" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Step through the moves" })).toBeInTheDocument();
  });

  it("keeps the title, count and progress on one short line above the card", async () => {
    const id = await makeDeck("Two", [...drafts("1. e4 e5", "moves"), ...drafts("1. d4 d5", "moves")]);
    renderReview(`?deck=${id}`);
    const title = await screen.findByRole("heading", { level: 1, name: "Practise: Two" });
    const row = title.closest("div")!.parentElement!;
    expect(within(row).getByText("Card 1 of 2")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "End session" })).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "All decks" })).toHaveAttribute("href", "/decks");
    expect(title).toHaveClass("text-2xl");
  });

  it("has no footnotes explaining how cards are checked", async () => {
    const id = await makeDeck("Notes", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByRole("heading", { level: 2, name: "White to move" });
    expect(screen.queryByText(/not an engine/)).not.toBeInTheDocument();
    expect(screen.queryByText(/scheduled/)).not.toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Scheduled review: grades are asked for and saved.

const DAY = 86_400_000;

const gradeGroup = () => screen.findByRole("group", { name: "How did it go?" });
const gradeButton = async (label: string) => within(await gradeGroup()).getByRole("button", { name: new RegExp(`^${label}`) });
const intervalOf = async (label: string) => (await gradeButton(label)).querySelector(".interval")?.textContent;

async function seedFastHistory(count: number, activeMs = 8000) {
  const entries = Array.from({ length: count }, (_, i) => ({
    id: `seed-${i}`,
    cardId: `old-${i}`,
    deckId: "old",
    reviewedAt: 1000 + i,
    rating: 3,
    suggested: 3,
    nudged: false,
    outcome: "first-try",
    mistakes: 0,
    hintUsed: false,
    revealed: false,
    playerMoves: 1,
    timing: { activeMs, idleMs: 0, hiddenMs: 0, elapsedMs: activeMs, firstMoveMs: activeMs, flags: [], reliable: true },
    before: { state: 0, due: null, stability: null, difficulty: null },
    after: { state: 2, due: 5000, stability: 3, difficulty: 5, scheduledDays: 3 },
    elapsedDays: 0,
    desiredRetention: 0.9,
  }));
  await db.reviews.bulkAdd(entries as never);
}

describe("Scheduled review: asking for a grade", () => {
  it("shows four grades with real intervals once the answer is out, and no Next card button", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 1");
    await play({ from: "e2", to: "e4" });
    const group = await gradeGroup();
    expect(within(group).getAllByRole("button").map((button) => button.textContent?.replace(/\d.*$/, ""))).toEqual(["Again", "Hard", "Good", "Easy"]);
    for (const label of ["Again", "Hard", "Good", "Easy"]) expect(await intervalOf(label)).toMatch(/^\d+ (day|days|month|months)$/);
    expect(screen.queryByRole("button", { name: "Next card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See results" })).not.toBeInTheDocument();
  });

  it("suggests Good for a first-try answer and says why", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 1");
    await play({ from: "e2", to: "e4" });
    expect(await screen.findByText(/Suggested: Good\. Right first time\./)).toBeInTheDocument();
  });

  it("saves the schedule and the grade that was pressed, then moves on", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 1");
    await play({ from: "e2", to: "e4" });
    const shown = await intervalOf("Good");
    await userEvent.click(await gradeButton("Good"));
    expect(await screen.findByRole("heading", { name: "You went through 1 card" })).toBeInTheDocument();

    const [schedule] = await db.schedules.toArray();
    expect(schedule.reps).toBe(1);
    const [entry] = await db.reviews.toArray();
    expect(entry).toMatchObject({ rating: 3, suggested: 3, outcome: "first-try", cardId: schedule.cardId });
    const { formatInterval } = await import("../../domain/scheduling");
    expect(shown).toBe(formatInterval((schedule.due - entry.reviewedAt) / DAY));
  });

  it("gives FSRS the grade the person chose, not the one suggested", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 1");
    expect(dropMove({ from: "d2", to: "d4" })).toBe(false);
    await play({ from: "e2", to: "e4" });
    expect(await screen.findByText(/Suggested: Hard\. It took a hint or a second try\./)).toBeInTheDocument();
    await userEvent.click(await gradeButton("Easy"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    const [entry] = await db.reviews.toArray();
    expect(entry).toMatchObject({ rating: 4, suggested: 2, outcome: "with-help", mistakes: 1 });
  });

  it("suggests Again after the answer was shown", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 1");
    dropMove({ from: "d2", to: "d4" });
    await click("Show answer");
    expect(await screen.findByText(/Suggested: Again\. You needed to see the answer\./)).toBeInTheDocument();
  });

  it("saves nothing in practice", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`);
    await screen.findByText("Card 1 of 1");
    await play({ from: "e2", to: "e4" });
    expect(await screen.findByRole("button", { name: "See results" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "How did it go?" })).not.toBeInTheDocument();
    expect(await db.schedules.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });

  it("only counts a card once it has been graded", async () => {
    const id = await makeDeck("Two", [...drafts("1. e4 e5", "moves"), ...drafts("1. d4 d5", "moves")]);
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 2");
    await play({ from: "e2", to: "e4" });
    await gradeGroup();
    await click("End session");
    expect(await screen.findByRole("heading", { name: "Session ended" })).toBeInTheDocument();
    expect(await db.schedules.count()).toBe(0);
  });
});

describe("Scheduled review: timing", () => {
  it("records how long the first move took, apart from the grade", async () => {
    let now = 1_000_000;
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true, clock: () => now });
    await screen.findByText("Card 1 of 1");
    now += 5000;
    await play({ from: "e2", to: "e4" });
    await userEvent.click(await gradeButton("Good"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    const [entry] = await db.reviews.toArray();
    expect(entry.timing).toMatchObject({ activeMs: 5000, idleMs: 0, hiddenMs: 0, firstMoveMs: 5000, flags: [], reliable: true });
    expect(entry.rating).toBe(3);
  });

  it("doesn't count a long idle stretch as thinking, and flags the time", async () => {
    let now = 1_000_000;
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true, clock: () => now });
    await screen.findByText("Card 1 of 1");
    now += 200_000;
    await play({ from: "e2", to: "e4" });
    expect(await screen.findByText(/The time wasn't counted: you were away or idle\./)).toBeInTheDocument();
    await userEvent.click(await gradeButton("Good"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    const [entry] = await db.reviews.toArray();
    expect(entry.timing).toMatchObject({ activeMs: 30_000, idleMs: 170_000, reliable: false, flags: ["idle"] });
    expect(entry.rating).toBe(3);
  });

  it("keeps time with the tab hidden out of the thinking time", async () => {
    let now = 1_000_000;
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true, clock: () => now });
    await screen.findByText("Card 1 of 1");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    now += 2000;
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    now += 60_000;
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    now += 3000;
    await play({ from: "e2", to: "e4" });
    await userEvent.click(await gradeButton("Good"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    visibility.mockRestore();
    const [entry] = await db.reviews.toArray();
    expect(entry.timing).toMatchObject({ activeMs: 5000, hiddenMs: 60_000, flags: ["hidden"], reliable: false });
  });

  it("starts the clock when you start playing, not while you study", async () => {
    let now = 1_000_000;
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}&mode=learn`, { scheduled: true, clock: () => now });
    await screen.findByText("Card 1 of 1");
    now += 90_000;
    await click("Play it from memory");
    now += 4000;
    await play({ from: "e2", to: "e4" });
    await userEvent.click(await gradeButton("Good"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    const [entry] = await db.reviews.toArray();
    expect(entry.timing).toMatchObject({ activeMs: 4000, reliable: true });
  });

  it("suggests Easy for a clearly quick answer once there is enough history, and still saves the grade pressed", async () => {
    await seedFastHistory(10);
    let now = 1_000_000;
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true, clock: () => now });
    await screen.findByText("Card 1 of 1");
    now += 1500;
    await play({ from: "e2", to: "e4" });
    expect(await screen.findByText(/Suggested: Easy\. Right first time, and quicker than usual\. Took 2 s\./)).toBeInTheDocument();
    await userEvent.click(await gradeButton("Good"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    const entry = (await db.reviews.toArray()).find((item) => item.id !== undefined && !item.id.startsWith("seed-"));
    expect(entry).toMatchObject({ rating: 3, suggested: 4, nudged: true });
  });

  it("leaves the suggestion alone when response time is switched off", async () => {
    await seedFastHistory(10);
    const { saveSettings } = await import("../../data/progress");
    await saveSettings({ timeSignal: false });
    let now = 1_000_000;
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true, clock: () => now });
    await screen.findByText("Card 1 of 1");
    now += 1500;
    await play({ from: "e2", to: "e4" });
    expect(await screen.findByText(/Suggested: Good\. Right first time\./)).toBeInTheDocument();
  });

  it("never lowers the suggestion for a slow answer", async () => {
    await seedFastHistory(10);
    let now = 1_000_000;
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true, clock: () => now });
    await screen.findByText("Card 1 of 1");
    now += 25_000;
    await play({ from: "e2", to: "e4" });
    expect(await screen.findByText(/Suggested: Good\. Right first time\. Took 25 s\./)).toBeInTheDocument();
  });
});

describe("Scheduled review: what comes up", () => {
  it("brings back a card that is due, with intervals worked from its history", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    const [card] = await listCards(id);
    const { recordReview } = await import("../../data/progress");
    await recordReview({
      card,
      grade: "good",
      suggested: "good",
      nudged: false,
      outcome: "first-try",
      tally: { mistakes: 0, hintUsed: false, revealed: false, played: 1 },
      playerMoves: 1,
      timing: { shownAt: 0, firstMoveAt: 1, completedAt: 2, elapsedMs: 2, activeMs: 2, idleMs: 0, hiddenMs: 0, firstMoveActiveMs: 1, flags: [], reliable: true },
      desiredRetention: 0.9,
      now: Date.now() - 30 * DAY,
    });
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 1");
    await play({ from: "e2", to: "e4" });
    await userEvent.click(await gradeButton("Good"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    const reviews = await db.reviews.orderBy("reviewedAt").toArray();
    expect(reviews).toHaveLength(2);
    expect(reviews[1].before.due).toBe(reviews[0].after.due);
    expect(reviews[1].elapsedDays).toBeGreaterThan(29);
    expect((await db.schedules.get(card.id))?.reps).toBe(2);
  });

  it("says nothing is due when every card is waiting, and says when the next one comes", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    const [card] = await listCards(id);
    const { recordReview } = await import("../../data/progress");
    await recordReview({
      card,
      grade: "good",
      suggested: "good",
      nudged: false,
      outcome: "first-try",
      tally: { mistakes: 0, hintUsed: false, revealed: false, played: 1 },
      playerMoves: 1,
      timing: { shownAt: 0, firstMoveAt: 1, completedAt: 2, elapsedMs: 2, activeMs: 2, idleMs: 0, hiddenMs: 0, firstMoveActiveMs: 1, flags: [], reliable: true },
      desiredRetention: 0.9,
    });
    renderReview(`?deck=${id}`, { scheduled: true });
    expect(await screen.findByText("Nothing due in Openings.")).toBeInTheDocument();
    expect(screen.getByText(/The next card is due (today|tomorrow|in \d+ days)\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Practise anyway" })).toHaveAttribute("href", `/review?deck=${id}&practice=1`);
    expect(screen.queryByText(/Card 1 of/)).not.toBeInTheDocument();
  });

  it("Learn brings only cards you haven't seen", async () => {
    const id = await makeDeck("Mixed", [...drafts("1. e4 e5", "moves"), ...drafts("1. d4 d5", "moves")]);
    const [seen] = await listCards(id);
    const { recordReview } = await import("../../data/progress");
    await recordReview({
      card: seen,
      grade: "good",
      suggested: "good",
      nudged: false,
      outcome: "first-try",
      tally: { mistakes: 0, hintUsed: false, revealed: false, played: 1 },
      playerMoves: 1,
      timing: { shownAt: 0, firstMoveAt: 1, completedAt: 2, elapsedMs: 2, activeMs: 2, idleMs: 0, hiddenMs: 0, firstMoveActiveMs: 1, flags: [], reliable: true },
      desiredRetention: 0.9,
    });
    renderReview(`?deck=${id}&mode=learn`, { scheduled: true });
    expect(await screen.findByText("Card 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Learn: Mixed" })).toBeInTheDocument();
  });

  it("says when there is nothing new to learn", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    const [card] = await listCards(id);
    const { recordReview } = await import("../../data/progress");
    await recordReview({
      card,
      grade: "good",
      suggested: "good",
      nudged: false,
      outcome: "first-try",
      tally: { mistakes: 0, hintUsed: false, revealed: false, played: 1 },
      playerMoves: 1,
      timing: { shownAt: 0, firstMoveAt: 1, completedAt: 2, elapsedMs: 2, activeMs: 2, idleMs: 0, hiddenMs: 0, firstMoveActiveMs: 1, flags: [], reliable: true },
      desiredRetention: 0.9,
    });
    renderReview(`?deck=${id}&mode=learn`, { scheduled: true });
    expect(await screen.findByText("No new cards in Openings.")).toBeInTheDocument();
  });

  it("brings in a limited number of new cards at a time", async () => {
    const moves = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O";
    const long = [...drafts(moves, "moves", "w"), ...drafts(moves, "moves", "b")];
    expect(long.length).toBeGreaterThan(10);
    const id = await makeDeck("Long", long);
    renderReview(`?deck=${id}`, { scheduled: true });
    expect(await screen.findByText("Card 1 of 10")).toBeInTheDocument();
  });

  it("offers more after a session, and says when nothing is left", async () => {
    const id = await makeDeck("Openings", drafts("1. e4 e5", "moves"));
    renderReview(`?deck=${id}`, { scheduled: true });
    await screen.findByText("Card 1 of 1");
    await play({ from: "e2", to: "e4" });
    await userEvent.click(await gradeButton("Good"));
    await screen.findByRole("heading", { name: "You went through 1 card" });
    await click("Review more");
    expect(await screen.findByText("Nothing due in Openings.")).toBeInTheDocument();
  });
});
