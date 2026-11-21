import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { START_FEN } from "../../domain/fen";
import { boardProps, dropMove } from "../../test/boardMock";
import { CreatePage } from "./CreatePage";

vi.mock("../../board/Board", async () => await import("../../test/boardMock"));

const board = () => screen.getByTestId("board");
const fenField = () => screen.getByLabelText("FEN") as HTMLInputElement;

function renderPage() {
  return render(
    <MemoryRouter>
      <CreatePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  boardProps.current = null;
});

describe("Create page", () => {
  it("opens on the starting position with White to move", () => {
    renderPage();
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(board()).toHaveAttribute("data-interactive", "turn");
    expect(fenField().value).toBe(START_FEN);
    expect(screen.getByText("White to move.")).toBeInTheDocument();
    expect(screen.getByText("No moves played yet.")).toBeInTheDocument();
  });

  it("loads a valid FEN, keeping the side to move", async () => {
    renderPage();
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    await userEvent.clear(fenField());
    await userEvent.type(fenField(), fen);
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
    expect(board()).toHaveAttribute("data-fen", fen);
    expect(screen.getByText("Black to move.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a clear error for an invalid FEN and leaves the board alone", async () => {
    renderPage();
    await userEvent.clear(fenField());
    await userEvent.type(fenField(), "not a fen");
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/That isn't a valid FEN/);
    expect(fenField()).toHaveAttribute("aria-invalid", "true");
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("clears the error once a valid FEN is entered", async () => {
    renderPage();
    await userEvent.clear(fenField());
    await userEvent.type(fenField(), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.clear(fenField());
    await userEvent.type(fenField(), "8/8/8/8/8/8/k7/4K3 w - - 0 1");
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fenField()).not.toHaveAttribute("aria-invalid");
  });

  it("asks for a FEN when the field is empty", async () => {
    renderPage();
    await userEvent.clear(fenField());
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a FEN to set the position.");
  });

  it("applies a move dropped on the board and updates the FEN, move list and turn", () => {
    renderPage();
    expect(dropMove({ from: "e2", to: "e4" })).toBe(true);
    expect(board()).toHaveAttribute("data-last-move", "e2e4");
    expect(screen.getByText("1. e4")).toBeInTheDocument();
    expect(screen.getByText("Black to move.")).toBeInTheDocument();
    expect(fenField().value).toContain(" b ");
  });

  it("refuses an illegal move from the board", () => {
    renderPage();
    expect(dropMove({ from: "e2", to: "e5" })).toBe(false);
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("promotes with the piece chosen", async () => {
    renderPage();
    await userEvent.clear(fenField());
    await userEvent.type(fenField(), "k7/4P3/8/8/8/8/8/K7 w - - 0 1");
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
    expect(dropMove({ from: "e7", to: "e8", promotion: "q" })).toBe(true);
    expect(screen.getByText("1. e8=Q+")).toBeInTheDocument();
  });

  it("plays a typed move", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Play a move"), "Nf3");
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("1. Nf3")).toBeInTheDocument();
    expect(board().getAttribute("data-fen")).toContain("5N2");
    expect((screen.getByLabelText("Play a move") as HTMLInputElement).value).toBe("");
  });

  it("explains a typed move that isn't legal", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Play a move"), "Nf6");
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nf6 isn't a legal move in this position.");
    expect(board()).toHaveAttribute("data-fen", START_FEN);
  });

  it("prompts for a move when the field is empty", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type a move, such as Nf3 or e4.");
  });

  it("undoes the last move, and Undo is unavailable with nothing to undo", async () => {
    renderPage();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveAttribute("aria-disabled", "true");
    dropMove({ from: "e2", to: "e4" });
    expect(undo).not.toHaveAttribute("aria-disabled");
    await userEvent.click(undo);
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(screen.getByText("No moves played yet.")).toBeInTheDocument();
  });

  it("flips the board", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Flip board" }));
    expect(board()).toHaveAttribute("data-orientation", "b");
    await userEvent.click(screen.getByRole("button", { name: "Flip board" }));
    expect(board()).toHaveAttribute("data-orientation", "w");
  });

  it("returns to the starting position", async () => {
    renderPage();
    dropMove({ from: "e2", to: "e4" });
    await userEvent.click(screen.getByRole("button", { name: "Start position" }));
    expect(board()).toHaveAttribute("data-fen", START_FEN);
    expect(screen.getByText("No moves played yet.")).toBeInTheDocument();
  });

  it("announces checkmate and stops accepting moves from the board's turn", () => {
    renderPage();
    for (const [from, to] of [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]]) {
      expect(dropMove({ from, to })).toBe(true);
    }
    expect(screen.getByText("Checkmate. Black wins.")).toBeInTheDocument();
    expect(dropMove({ from: "a2", to: "a3" })).toBe(false);
  });
});
