import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { START_FEN } from "../domain/fen";

vi.mock("../board/Board", async () => await import("../test/boardMock"));

import { ContinuationViewer } from "./ContinuationViewer";

const TEXT = "1. e4 {The king's pawn.} e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6";

const boardFen = () => screen.getByTestId("board").getAttribute("data-fen");
const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

describe("ContinuationViewer", () => {
  it("shows every move as a button, with comments and variations", () => {
    render(<ContinuationViewer fen={START_FEN} continuation={TEXT} />);
    const moves = screen.getByRole("group", { name: "Continuation" });
    for (const name of ["1. e4", "1... e5", "2. Nf3", "2. Bc4", "2... Nf6", "2... Nc6"]) {
      expect(within(moves).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(moves).getByText("The king's pawn.")).toBeInTheDocument();
  });

  it("jumps the board to a clicked move and highlights it", () => {
    render(<ContinuationViewer fen={START_FEN} continuation={TEXT} />);
    expect(boardFen()).toBe(START_FEN);
    fireEvent.click(screen.getByRole("button", { name: "1. e4" }));
    expect(boardFen()).toBe(afterE4);
    expect(screen.getByRole("button", { name: "1. e4" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("board")).toHaveAttribute("data-last-move", "e2e4");
  });

  it("follows a variation", () => {
    render(<ContinuationViewer fen={START_FEN} continuation={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: "2... Nf6" }));
    expect(boardFen()).toBe("rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3");
    expect(screen.getByRole("button", { name: "2... Nf6" })).toHaveAttribute("aria-current", "true");
  });

  it("steps forwards and back with the buttons", () => {
    render(<ContinuationViewer fen={START_FEN} continuation={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    expect(boardFen()).toBe(afterE4);
    fireEvent.click(screen.getByRole("button", { name: "Previous move" }));
    expect(boardFen()).toBe(START_FEN);
    fireEvent.click(screen.getByRole("button", { name: "Forward to the end" }));
    expect(screen.getByRole("button", { name: "2... Nc6" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "Back to the start" }));
    expect(boardFen()).toBe(START_FEN);
  });

  it("steps with the arrow keys", () => {
    render(<ContinuationViewer fen={START_FEN} continuation={TEXT} />);
    const viewer = screen.getByRole("group", { name: "Continuation viewer" });
    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "1... e5" })).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(viewer, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "1. e4" })).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(viewer, { key: "End" });
    expect(screen.getByRole("button", { name: "2... Nc6" })).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(viewer, { key: "Home" });
    expect(boardFen()).toBe(START_FEN);
  });

  it("disables the arrows that can't be used", () => {
    render(<ContinuationViewer fen={START_FEN} continuation="1. e4" />);
    expect(screen.getByRole("button", { name: "Previous move" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    expect(screen.getByRole("button", { name: "Next move" })).toHaveAttribute("aria-disabled", "true");
  });

  it("says when there is no continuation", () => {
    render(<ContinuationViewer fen={START_FEN} continuation="" />);
    expect(screen.getByText("No continuation on this card.")).toBeInTheDocument();
    expect(boardFen()).toBe(START_FEN);
  });

  it("reports a continuation that doesn't work", () => {
    render(<ContinuationViewer fen={START_FEN} continuation="1. e5" />);
    expect(screen.getByRole("alert")).toHaveTextContent("isn't a legal move");
  });

  it("starts from the Black side when the position says so", () => {
    render(<ContinuationViewer fen={afterE4} continuation="1... c5 2. Nf3" orientation="b" />);
    expect(screen.getByRole("button", { name: "1... c5" })).toBeInTheDocument();
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "b");
  });
});
