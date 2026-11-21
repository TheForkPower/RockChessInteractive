import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
import { START_FEN } from "../../domain/fen";
import { BoardEditor } from "./BoardEditor";

const square = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const tool = (name: string) => screen.getByRole("button", { name });
const fenText = () => (screen.getByLabelText("FEN of this position") as HTMLTextAreaElement).value;

function setup(initialFen = START_FEN) {
  const onUse = vi.fn();
  const onCancel = vi.fn();
  render(<BoardEditor initialFen={initialFen} onUse={onUse} onCancel={onCancel} />);
  return { onUse, onCancel };
}

describe("Board editor", () => {
  it("starts from the position it is given", () => {
    setup();
    expect(fenText()).toBe(START_FEN);
    expect(square("e1")).toHaveAccessibleName("e1, white king");
    expect(square("e4")).toHaveAccessibleName("e4, empty");
    expect(screen.getByRole("status")).toHaveTextContent("This position is valid. White to move.");
  });

  it("places a piece, and clicking it again with the same piece removes it", async () => {
    setup();
    await userEvent.click(tool("Clear board"));
    await userEvent.click(tool("white knight"));
    await userEvent.click(square("c3"));
    expect(square("c3")).toHaveAccessibleName("c3, white knight");
    expect(fenText()).toBe("8/8/8/8/8/2N5/8/8 w - - 0 1");
    await userEvent.click(square("c3"));
    expect(square("c3")).toHaveAccessibleName("c3, empty");
  });

  it("replaces a piece with a different one", async () => {
    setup();
    await userEvent.click(tool("black queen"));
    await userEvent.click(square("a2"));
    expect(square("a2")).toHaveAccessibleName("a2, black queen");
  });

  it("removes pieces with the remove tool", async () => {
    setup();
    await userEvent.click(tool("Remove pieces"));
    await userEvent.click(square("e2"));
    expect(square("e2")).toHaveAccessibleName("e2, empty");
  });

  it("moves a piece by clicking it, then clicking where it goes", async () => {
    setup();
    await userEvent.click(square("e2"));
    expect(square("e2")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(square("e4"));
    expect(square("e2")).toHaveAccessibleName("e2, empty");
    expect(square("e4")).toHaveAccessibleName("e4, white pawn");
  });

  it("lets a piece take an enemy piece but not jump onto a friend", async () => {
    setup();
    await userEvent.click(square("d1")); // queen
    await userEvent.click(square("d2")); // own pawn: switches the pick instead
    expect(square("d1")).toHaveAccessibleName("d1, white queen");
    expect(square("d2")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(square("d7")); // black pawn
    expect(square("d7")).toHaveAccessibleName("d7, white pawn");
  });

  it("sets whose move it is", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Black to move" }));
    expect(fenText()).toContain(" b KQkq ");
    expect(screen.getByRole("status")).toHaveTextContent("Black to move.");
  });

  it("only allows castling while the king and rook are at home", async () => {
    setup();
    const shortWhite = screen.getByRole("checkbox", { name: "White can castle short" });
    expect(shortWhite).toBeChecked();
    await userEvent.click(tool("Remove pieces"));
    await userEvent.click(square("h1"));
    expect(shortWhite).toBeDisabled();
    expect(shortWhite).not.toBeChecked();
    expect(fenText()).toContain(" w Qkq ");
    await userEvent.click(screen.getByRole("checkbox", { name: "Black can castle long" }));
    expect(fenText()).toContain(" w Qk ");
  });

  it("flags a position with no kings and won't use it", async () => {
    const { onUse } = setup();
    await userEvent.click(tool("Clear board"));
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't a valid FEN/);
    const use = tool("Use this position");
    expect(use).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(use);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("flags a side that is in check when it isn't their move", async () => {
    setup("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    await userEvent.click(tool("white rook"));
    await userEvent.click(square("e5"));
    await userEvent.click(screen.getByRole("radio", { name: "White to move" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Black is in check/);
  });

  it("hands back a checked FEN", async () => {
    const { onUse } = setup();
    await userEvent.click(square("e2"));
    await userEvent.click(square("e4"));
    await userEvent.click(screen.getByRole("radio", { name: "Black to move" }));
    await userEvent.click(tool("Use this position"));
    expect(onUse).toHaveBeenCalledWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  });

  it("cancels", async () => {
    const { onCancel } = setup();
    await userEvent.click(tool("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("turns the board over without losing the position", async () => {
    setup();
    const before = fenText();
    await userEvent.click(tool("Flip board"));
    expect(fenText()).toBe(before);
    expect(square("e1")).toHaveAccessibleName("e1, white king");
  });

  it("moves a piece by dragging it to another square", () => {
    setup();
    fireEvent.dragStart(square("e2"));
    fireEvent.dragOver(square("e4"));
    fireEvent.drop(square("e4"));
    expect(square("e4")).toHaveAccessibleName("e4, white pawn");
    expect(square("e2")).toHaveAccessibleName("e2, empty");
  });

  it("places a piece dragged from the palette", async () => {
    setup();
    await userEvent.click(tool("Clear board"));
    fireEvent.dragStart(tool("black queen"));
    fireEvent.drop(square("d5"));
    expect(square("d5")).toHaveAccessibleName("d5, black queen");
  });

  it("takes a piece off when it is dragged away and let go outside the board", () => {
    setup();
    fireEvent.dragStart(square("a2"));
    fireEvent.dragEnd(square("a2"), { dataTransfer: { dropEffect: "none" } });
    expect(square("a2")).toHaveAccessibleName("a2, empty");
  });

  it("keeps a piece that was dropped on a square", () => {
    setup();
    fireEvent.dragStart(square("a2"));
    fireEvent.drop(square("a4"));
    fireEvent.dragEnd(square("a2"), { dataTransfer: { dropEffect: "move" } });
    expect(square("a4")).toHaveAccessibleName("a4, white pawn");
  });

  it("loads a FEN onto the board", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Load a FEN"), AFTER_E4);
    await userEvent.click(tool("Load FEN"));
    expect(fenText()).toBe(AFTER_E4);
    expect(square("e4")).toHaveAccessibleName("e4, white pawn");
    expect(screen.getByLabelText("Load a FEN")).toHaveValue("");
  });

  it("explains a FEN that can't be loaded and leaves the board alone", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Load a FEN"), "nonsense");
    await userEvent.click(tool("Load FEN"));
    expect(screen.getByRole("alert")).toHaveTextContent(/valid FEN/);
    expect(fenText()).toBe(START_FEN);
  });

  it("copies the FEN", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup();
    await userEvent.click(tool("Copy FEN"));
    expect(writeText).toHaveBeenCalledWith(START_FEN);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
