import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../data/db";
import { listCards, listDecks } from "../../data/repo";
import { START_FEN } from "../../domain/fen";
import { boardProps, dropMove } from "../../test/boardMock";
import { CreatePage } from "./CreatePage";

vi.mock("../../board/Board", async () => await import("../../test/boardMock"));

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const board = () => screen.getByTestId("board");
const fenField = () => screen.getByLabelText("FEN") as HTMLTextAreaElement;
const click = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));
const pick = (name: string) => userEvent.click(screen.getByRole("radio", { name }));

/** Typing { and ( through userEvent is awkward, so set the text directly. */
const setText = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** The page opens on a choice of how to start. Most tests go straight on to one of the ways. */
function renderPage(way: "fen" | "pgn" | "choose" = "fen") {
  const result = render(
    <MemoryRouter>
      <CreatePage />
    </MemoryRouter>,
  );
  if (way === "fen") fireEvent.click(screen.getByRole("button", { name: /^Paste a FEN/ }));
  if (way === "pgn") fireEvent.click(screen.getByRole("button", { name: /^Paste or upload a PGN/ }));
  return result;
}

beforeEach(async () => {
  boardProps.current = null;
  await db.delete();
  await db.open();
});

describe("Create page: the position", () => {
  it("opens on the starting position with White to move", () => {
    renderPage();
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(board()).toHaveAttribute("data-interactive", "turn");
    expect(fenField().value).toBe(START_FEN);
    expect(screen.getByText("White to move.")).toBeInTheDocument();
    expect(screen.getByText(/No moves yet/)).toBeInTheDocument();
  });

  it("loads a valid FEN", async () => {
    renderPage();
    setText("FEN", AFTER_E4);
    await click("Set position");
    expect(board()).toHaveAttribute("data-fen", AFTER_E4);
    expect(screen.getByText("Black to move.")).toBeInTheDocument();
  });

  it("explains an invalid FEN and leaves the board alone", async () => {
    renderPage();
    setText("FEN", "not a fen");
    await click("Set position");
    expect(screen.getByRole("alert")).toHaveTextContent(/That isn't a valid FEN/);
    expect(fenField()).toHaveAttribute("aria-invalid", "true");
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("goes back to the starting position and forgets the moves", async () => {
    renderPage();
    expect(dropMove({ from: "e2", to: "e4" })).toBe(true);
    await click("Start position");
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(screen.getByText(/No moves yet/)).toBeInTheDocument();
  });

  it("flips the board", async () => {
    renderPage();
    await click("Flip board");
    expect(board()).toHaveAttribute("data-orientation", "b");
    await click("Flip board");
    expect(board()).toHaveAttribute("data-orientation", "w");
  });
});

describe("Create page: playing and typing moves", () => {
  it("adds a move played on the board to the move list and keeps the FEN box in step", () => {
    renderPage();
    expect(dropMove({ from: "e2", to: "e4" })).toBe(true);
    expect(board()).toHaveAttribute("data-fen", AFTER_E4);
    expect(board()).toHaveAttribute("data-last-move", "e2e4");
    expect(screen.getByRole("button", { name: "1. e4" })).toHaveAttribute("aria-current", "true");
    expect(fenField().value).toBe(AFTER_E4);
    expect(screen.getByText("Black to move.")).toBeInTheDocument();
  });

  it("refuses an illegal move", () => {
    renderPage();
    expect(dropMove({ from: "e2", to: "e5" })).toBe(false);
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("plays a typed line, keeping comments and variations", async () => {
    renderPage();
    setText("Moves", "1. e4 {The king's pawn.} e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6");
    await click("Add moves");
    const moves = within(screen.getByRole("group", { name: "Moves in this line" }));
    for (const name of ["1. e4", "1... e5", "2. Nf3", "2. Bc4", "2... Nf6", "2... Nc6"]) {
      expect(moves.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(moves.getByText("The king's pawn.")).toBeInTheDocument();
    expect(moves.getByRole("button", { name: "2... Nc6" })).toHaveAttribute("aria-current", "true");
    expect((screen.getByLabelText("Moves") as HTMLTextAreaElement).value).toBe("");
  });

  it("plays typed moves from the position on the board", async () => {
    renderPage();
    dropMove({ from: "e2", to: "e4" });
    setText("Moves", "e5 Nf3");
    await click("Add moves");
    expect(screen.getByRole("button", { name: "2. Nf3" })).toHaveAttribute("aria-current", "true");
  });

  it("names the move that can't be played, and adds nothing", async () => {
    renderPage();
    setText("Moves", "1. e4 e5 2. Nf3 Nf3");
    await click("Add moves");
    expect(screen.getByRole("alert")).toHaveTextContent('"2... Nf3" isn\'t a legal move');
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(screen.getByLabelText("Moves")).toHaveAttribute("aria-invalid", "true");
  });

  it("asks for moves when the box has none", async () => {
    renderPage();
    setText("Moves", "{just a comment}");
    await click("Add moves");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter some moves");
  });

  it("jumps to a clicked move and steps with the buttons", async () => {
    renderPage();
    setText("Moves", "1. e4 e5 2. Nf3");
    await click("Add moves");
    await click("1. e4");
    expect(board()).toHaveAttribute("data-fen", AFTER_E4);
    await click("Previous move");
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    await click("Forward to the end");
    expect(screen.getByRole("button", { name: "2. Nf3" })).toHaveAttribute("aria-current", "true");
    await click("Back to the start");
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("deletes the current move and what follows", async () => {
    renderPage();
    setText("Moves", "1. e4 e5 2. Nf3");
    await click("Add moves");
    await click("1... e5");
    await click("Delete move");
    expect(screen.queryByRole("button", { name: "1... e5" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2. Nf3" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1. e4" })).toHaveAttribute("aria-current", "true");
  });
});

describe("Create page: PGN", () => {
  const pgn = `[Event "Casual"]
[White "Morphy"]
[Black "Duke"]
[Result "1-0"]

1. e4 e5 2. Nf3 (2. f4 {the King's Gambit} exf4) 2... d6 1-0`;

  it("reads a PGN and keeps its variations", async () => {
    renderPage("pgn");
    setText("PGN", pgn);
    await click("Read PGN");
    expect(screen.getByRole("status")).toHaveTextContent("Loaded Morphy v Duke");
    const moves = within(screen.getByRole("group", { name: "Moves in this line" }));
    expect(moves.getByRole("button", { name: "2. f4" })).toBeInTheDocument();
    expect(moves.getByText("the King's Gambit")).toBeInTheDocument();
    await userEvent.click(moves.getByRole("button", { name: "2... exf4" }));
    expect(board()).toHaveAttribute("data-fen", "rnbqkbnr/pppp1ppp/8/8/4Pp2/8/PPPP2PP/RNBQKBNR w KQkq - 0 3");
  });

  it("explains a PGN with an illegal move", async () => {
    renderPage("pgn");
    setText("PGN", "1. e4 e4");
    await click("Read PGN");
    expect(screen.getByRole("alert")).toHaveTextContent("isn't a legal move");
  });

  it("lets you pick between several games", async () => {
    renderPage("pgn");
    setText("PGN", `${pgn}\n\n[Event "Second"]\n\n1. d4 d5 *`);
    await click("Read PGN");
    await userEvent.selectOptions(screen.getByLabelText("Game"), "1");
    expect(screen.getByRole("status")).toHaveTextContent("Loaded Second");
    expect(screen.getByRole("button", { name: "1. d4" })).toBeInTheDocument();
  });

  it("opens a .pgn file", async () => {
    renderPage("pgn");
    const file = new File([pgn], "morphy.pgn", { type: "text/plain" });
    await userEvent.upload(screen.getByLabelText("PGN file"), file);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Loaded Morphy v Duke"));
    expect((screen.getByLabelText("PGN") as HTMLTextAreaElement).value).toContain("Morphy");
  });
});

describe("Create page: making a card", () => {
  it("is not available until there is a move to answer with", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Make a card" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Make a deck from this line" })).toHaveAttribute("aria-disabled", "true");
  });

  it("makes a card from a position in a PGN, with the variations on the back, and saves it to a new deck", async () => {
    renderPage();
    setText("Moves", "1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6");
    await click("Add moves");
    await click("1... e5");
    expect(screen.getByText(/the position after 1... e5: you find 2. Nf3/)).toBeInTheDocument();
    await click("Make a card");

    expect(screen.getByRole("heading", { level: 1, name: "Make a card" })).toBeInTheDocument();
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("2. Nf3");
    expect((screen.getByLabelText("Continuation (PGN)") as HTMLTextAreaElement).value).toBe("2. Nf3 (2. Bc4 Nf6) 2... Nc6");
    expect((screen.getByLabelText("Question") as HTMLInputElement).value).toBe("White to move.");

    await userEvent.type(screen.getByLabelText("New deck name"), "Open Games");
    fireEvent.change(screen.getByLabelText("Explanation"), { target: { value: "Develop and attack e5." } });
    await click("Save card");

    expect(await screen.findByText("Saved 1 card to Open Games")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the deck" })).toHaveAttribute("href", expect.stringContaining("/decks?deck="));
    const [deck] = await listDecks();
    const [card] = await listCards(deck.id);
    expect(deck).toMatchObject({ name: "Open Games", cardCount: 1 });
    expect(card).toMatchObject({
      kind: "move",
      side: "w",
      explanation: "Develop and attack e5.",
      continuation: "2. Nf3 (2. Bc4 Nf6) 2... Nc6",
    });
    expect(card.answer[0].san).toBe("Nf3");
  });

  it("makes a card from the position before a move you just played", async () => {
    renderPage();
    dropMove({ from: "e2", to: "e4" });
    expect(screen.getByText(/the starting position: you find 1. e4/)).toBeInTheDocument();
    await click("Make a card");
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("1. e4");
  });

  it("records the PGN it came from", async () => {
    renderPage("pgn");
    setText("PGN", '[Event "Test"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 *');
    await click("Read PGN");
    await click("Make a card");
    await userEvent.type(screen.getByLabelText("New deck name"), "From PGN");
    await click("Save card");
    await screen.findByText(/Saved 1 card/);
    const [deck] = await listDecks();
    const [card] = await listCards(deck.id);
    expect((await db.sources.get(card.sourceId as string))?.title).toBe("A v B");
  });

  it("needs a deck name and an answer that works", async () => {
    renderPage();
    dropMove({ from: "e2", to: "e4" });
    await click("Make a card");
    await click("Save card");
    expect(screen.getByText("Give the new deck a name.")).toBeInTheDocument();
    expect(await listDecks()).toEqual([]);

    await userEvent.type(screen.getByLabelText("New deck name"), "D");
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "Ke5" } });
    expect(screen.getByText(/isn't a legal move/)).toBeInTheDocument();
    await click("Save card");
    expect(await listDecks()).toEqual([]);
  });

  it("goes back to the position when you cancel", async () => {
    renderPage();
    dropMove({ from: "e2", to: "e4" });
    await click("Make a card");
    await click("Cancel");
    expect(screen.getByRole("heading", { level: 1, name: "Create cards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1. e4" })).toBeInTheDocument();
  });

  it("won't save the same card twice", async () => {
    renderPage();
    dropMove({ from: "e2", to: "e4" });
    await click("Make a card");
    await userEvent.type(screen.getByLabelText("New deck name"), "Once");
    await click("Save card");
    await screen.findByText(/Saved 1 card/);

    await click("Make a card");
    await userEvent.selectOptions(screen.getByLabelText("Deck"), "Once (1)");
    await click("Save card");
    expect(await screen.findByText(/already has a card with that position/)).toBeInTheDocument();
    expect((await listDecks())[0].cardCount).toBe(1);
  });
});

describe("Create page: making a deck", () => {
  const LINE = "1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 3. Bb5 a6";

  async function openBuilder() {
    renderPage();
    setText("Moves", LINE);
    await click("Add moves");
    await click("Make a deck from this line");
  }

  it("shows how many cards it will make", async () => {
    await openBuilder();
    expect(screen.getByText("3 cards")).toBeInTheDocument();
    expect(screen.getByText("Answers: e4, Nf3, Bb5")).toBeInTheDocument();
    await pick("Black");
    expect(screen.getByText("Answers: e5, Nc6, a6")).toBeInTheDocument();
    await pick("One for the whole line");
    expect(screen.getByText("One card with 6 moves")).toBeInTheDocument();
  });

  it("saves a card for each of White's moves, with the variations on the back", async () => {
    await openBuilder();
    await userEvent.type(screen.getByLabelText("New deck name"), "Ruy Lopez");
    await click("Make deck");
    expect(await screen.findByText("Saved 3 cards to Ruy Lopez")).toBeInTheDocument();
    const [deck] = await listDecks();
    const cards = await listCards(deck.id);
    expect(cards.map((card) => card.answer[0].san)).toEqual(["e4", "Nf3", "Bb5"]);
    expect(cards[1].continuation).toBe("2. Nf3 (2. Bc4) 2... Nc6 3. Bb5 a6");
  });

  it("can start from the position on the board", async () => {
    renderPage();
    setText("Moves", LINE);
    await click("Add moves");
    await click("1... e5");
    await click("Make a deck from this line");
    await pick("The position on the board");
    expect(screen.getByText("Answers: Nf3, Bb5")).toBeInTheDocument();
  });

  it("says when the line has no moves for that side, and a second run adds nothing new", async () => {
    renderPage();
    setText("Moves", "1. e4");
    await click("Add moves");
    await click("Make a deck from this line");
    await pick("Black");
    expect(screen.getByText("There are no moves for Black in this line.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make deck" })).toHaveAttribute("aria-disabled", "true");

    await pick("White");
    await userEvent.type(screen.getByLabelText("New deck name"), "Once");
    await click("Make deck");
    await screen.findByText(/Saved 1 card/);

    await click("Make a deck from this line");
    await userEvent.selectOptions(screen.getByLabelText("Deck"), "Once (1)");
    await click("Make deck");
    expect(await screen.findByText(/Once already has a card with that position/)).toBeInTheDocument();
  });
});

describe("Create page: the board editor", () => {
  it("opens the editor, and a position set up there becomes the position to build from", async () => {
    renderPage("choose");
    await click(/^Use the board editor/);
    expect(screen.getByRole("heading", { level: 1, name: "Board editor" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^e2,/ }));
    await userEvent.click(screen.getByRole("button", { name: /^e4,/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Black to move" }));
    await click("Use this position");
    expect(screen.getByRole("heading", { level: 1, name: "Create cards" })).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-fen", AFTER_E4);
    expect(fenField().value).toBe(AFTER_E4);
  });

  it("cancelling leaves the position as it was", async () => {
    renderPage("choose");
    await click(/^Use the board editor/);
    await userEvent.click(screen.getByRole("button", { name: /^e2,/ }));
    await userEvent.click(screen.getByRole("button", { name: /^e4,/ }));
    await click("Cancel");
    expect(screen.getByRole("heading", { level: 2, name: "How do you want to start?" })).toBeInTheDocument();
    await click(/^Paste a FEN/);
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("can also be opened from the position panel, and cancelling comes back to it", async () => {
    renderPage();
    await click("Set up the board by hand");
    await click("Cancel");
    expect(fenField()).toBeInTheDocument();
  });
});

describe("Create page: choosing how to start", () => {
  it("shows the three ways first and nothing else", () => {
    renderPage("choose");
    expect(screen.getByRole("heading", { level: 1, name: "Create cards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Paste a FEN/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Paste or upload a PGN/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Use the board editor/ })).toBeInTheDocument();
    expect(screen.queryByTestId("board")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("FEN")).not.toBeInTheDocument();
    expect(screen.queryByText(/Then make one card, or a deck/)).not.toBeInTheDocument();
  });

  it("shows only the PGN box after choosing a PGN", async () => {
    renderPage("choose");
    await click(/^Paste or upload a PGN/);
    expect(screen.getByLabelText("PGN")).toBeInTheDocument();
    expect(screen.queryByLabelText("FEN")).not.toBeInTheDocument();
    expect(board()).toBeInTheDocument();
  });

  it("goes back to the choice and keeps the position you had", async () => {
    renderPage();
    dropMove({ from: "e2", to: "e4" });
    await click("Choose another way to start");
    expect(screen.queryByTestId("board")).not.toBeInTheDocument();
    await click(/^Paste or upload a PGN/);
    expect(board()).toHaveAttribute("data-fen", AFTER_E4);
  });
});
