import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardProps, dropMove } from "../../test/boardMock";
import { PracticeCards } from "./PracticeCards";

vi.mock("../../board/Board", async () => await import("../../test/boardMock"));

const board = () => screen.getByTestId("board");

// fireEvent rather than userEvent: user-event hangs under vitest's fake timers.
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function nextCard() {
  click("Next card");
}

/** Plays a correct move on the first card (Rd8#), which completes it. */
function solveFirstCard() {
  return dropMove({ from: "d1", to: "d8" });
}

beforeEach(() => {
  vi.useFakeTimers();
  boardProps.current = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Practice cards", () => {
  it("opens on the first card with the question and no feedback yet", () => {
    render(<PracticeCards />);
    expect(screen.getByText("Practice card 1 of 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mate in one" })).toBeInTheDocument();
    expect(screen.getByText("White to play. Deliver checkmate.")).toBeInTheDocument();
    expect(screen.getByText("Move a piece on the board to answer.")).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-interactive", "turn");
  });

  it("says plainly that the cards are not saved and not engine-checked", () => {
    render(<PracticeCards />);
    expect(screen.getByText(/aren't saved or scheduled/)).toHaveTextContent(/not an engine/);
  });

  it("rejects a wrong move, shows feedback, and sends the piece back", () => {
    render(<PracticeCards />);
    const before = board().getAttribute("data-fen");
    expect(dropMove({ from: "d1", to: "d7" })).toBe(false); // legal, but not mate
    expect(screen.getByRole("status")).toHaveTextContent("Not quite");
    expect(board().getAttribute("data-fen")).toBe(before);
  });

  it("accepts the right move and shows the explanation", () => {
    render(<PracticeCards />);
    expect(solveFirstCard()).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Correct");
    expect(screen.getByText(/The bishop on g5 guards d8/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next card" })).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-interactive", "false");
  });

  it("keeps Show answer unavailable until two wrong tries, then plays the answer", () => {
    render(<PracticeCards />);
    const show = screen.getByRole("button", { name: "Show answer" });
    expect(show).toHaveAttribute("aria-disabled", "true");
    dropMove({ from: "d1", to: "d7" });
    expect(show).toHaveAttribute("aria-disabled", "true");
    dropMove({ from: "d1", to: "d2" });
    expect(show).not.toHaveAttribute("aria-disabled");
    fireEvent.click(show);
    expect(screen.getByRole("status")).toHaveTextContent("Here's how it goes");
    expect(board().getAttribute("data-fen")).toMatch(/^1n1Rkb1r/);
  });

  it("shows and hides the hint", () => {
    render(<PracticeCards />);
    click("Hint");
    expect(screen.getByText(/A rook move, with a bishop standing behind it/)).toBeInTheDocument();
    click("Hide hint");
    expect(screen.queryByText(/A rook move/)).not.toBeInTheDocument();
  });

  it("moves to the next card, and wraps round after the last", () => {
    render(<PracticeCards />);
    solveFirstCard();
    nextCard();
    expect(screen.getByText("Practice card 2 of 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Find the sacrifice" })).toBeInTheDocument();
  });

  it("restarts a finished card with Try again", () => {
    render(<PracticeCards />);
    const start = board().getAttribute("data-fen");
    solveFirstCard();
    click("Try again");
    expect(board().getAttribute("data-fen")).toBe(start);
    expect(screen.getByText("Move a piece on the board to answer.")).toBeInTheDocument();
  });

  it("plays the opponent's reply after a correct move, then finishes", () => {
    render(<PracticeCards />);
    solveFirstCard();
    nextCard(); // card 2: Qb8+ Nxb8
    expect(dropMove({ from: "b3", to: "b8" })).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Correct");
    expect(board()).toHaveAttribute("data-interactive", "false"); // waiting for the reply
    expect(dropMove({ from: "a1", to: "a2" })).toBe(false); // no moves while the opponent replies
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText(/Qb8\+! Nxb8 17\. Rd8#/)).toBeInTheDocument();
    expect(board()).toHaveAttribute("data-last-move", "d7b8");
  });

  it("works through a sequence card move by move", () => {
    render(<PracticeCards />);
    solveFirstCard();
    nextCard(); // card 2
    dropMove({ from: "b3", to: "b8" });
    act(() => void vi.advanceTimersByTime(700));
    nextCard(); // card 3
    dropMove({ from: "f4", to: "d6" });
    nextCard(); // card 4
    expect(screen.getByRole("heading", { name: "Play the finish" })).toBeInTheDocument();

    expect(dropMove({ from: "f5", to: "g7" })).toBe(true);
    act(() => void vi.advanceTimersByTime(700));
    expect(screen.getByRole("status")).toHaveTextContent("Now find the next move");

    expect(dropMove({ from: "f3", to: "f4" })).toBe(false); // legal but wrong
    expect(dropMove({ from: "f3", to: "f6" })).toBe(true);
    act(() => void vi.advanceTimersByTime(700));

    expect(dropMove({ from: "d6", to: "e7" })).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Correct");
    expect(screen.getByText(/21\. Nxg7\+ Kd8 22\. Qf6\+ Nxf6 23\. Be7#/)).toBeInTheDocument();

    nextCard();
    expect(screen.getByText("Practice card 1 of 4")).toBeInTheDocument();
  });

  it("clears its timer if the card is left mid-reply", () => {
    const { unmount } = render(<PracticeCards />);
    solveFirstCard();
    nextCard();
    dropMove({ from: "b3", to: "b8" });
    unmount();
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });
});
