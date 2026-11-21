import { INPUT_EVENT_TYPE, type MoveInputEvent, type PromotionResult } from "cm-chessboard/src/Chessboard.js";
import { describe, expect, it, vi } from "vitest";
import { Game, type MoveInput } from "../domain/game";
import { createMoveInputHandler, type BoardPort } from "./moveInput";

function setup(fen?: string, accept = true) {
  const game = new Game(fen);
  let dialogCallback: ((result: PromotionResult) => void) | null = null;
  const board: BoardPort = {
    addLegalMovesMarkers: vi.fn(),
    removeLegalMovesMarkers: vi.fn(),
    showPromotionDialog: vi.fn((_square, _color, callback) => {
      dialogCallback = callback;
    }),
    setPosition: vi.fn(),
  };
  const moves: MoveInput[] = [];
  const onMove = vi.fn((move: MoveInput) => {
    moves.push(move);
    return accept;
  });
  const handler = createMoveInputHandler(() => ({ board, game, onMove }));
  const send = (type: string, squareFrom?: string, squareTo?: string) =>
    handler({ type, squareFrom, squareTo, chessboard: board as never } as MoveInputEvent);
  return { board, game, onMove, moves, send, choosePiece: (r: PromotionResult) => dialogCallback?.(r) };
}

describe("move input handler", () => {
  it("picks up a piece of the side to move and shows its legal moves", () => {
    const { board, send } = setup();
    expect(send(INPUT_EVENT_TYPE.moveInputStarted, "e2")).toBe(true);
    const shown = (board.addLegalMovesMarkers as ReturnType<typeof vi.fn>).mock.calls[0][0] as { to: string }[];
    expect(shown.map((m) => m.to).sort()).toEqual(["e3", "e4"]);
  });

  it("refuses to pick up an empty square, an opponent's piece, or a piece with no moves", () => {
    const { board, send } = setup();
    expect(send(INPUT_EVENT_TYPE.moveInputStarted, "e4")).toBe(false); // empty
    expect(send(INPUT_EVENT_TYPE.moveInputStarted, "e7")).toBe(false); // Black's pawn
    expect(send(INPUT_EVENT_TYPE.moveInputStarted, "a1")).toBe(false); // blocked rook
    expect(board.addLegalMovesMarkers).not.toHaveBeenCalled();
  });

  it("clears the previous markers whenever a new piece is picked up", () => {
    const { board, send } = setup();
    send(INPUT_EVENT_TYPE.moveInputStarted, "e2");
    send(INPUT_EVENT_TYPE.moveInputStarted, "g1");
    expect(board.removeLegalMovesMarkers).toHaveBeenCalledTimes(2);
  });

  it("passes a legal move on and clears the markers", () => {
    const { board, onMove, send } = setup();
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e2", "e4")).toBe(true);
    expect(onMove).toHaveBeenCalledWith({ from: "e2", to: "e4" });
    expect(board.removeLegalMovesMarkers).toHaveBeenCalled();
  });

  it("returns false when the caller refuses a legal move, so the piece snaps back", () => {
    const { send, onMove } = setup(undefined, false);
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e2", "e4")).toBe(false);
    expect(onMove).toHaveBeenCalledOnce();
  });

  it("never passes an illegal move on", () => {
    const { send, onMove } = setup();
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e2", "e5")).toBe(false);
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e7", "e5")).toBe(false);
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "a1", "a5")).toBe(false);
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e2", undefined)).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("allows castling by moving the king two squares", () => {
    const { send, onMove } = setup("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e1", "g1")).toBe(true);
    expect(onMove).toHaveBeenCalledWith({ from: "e1", to: "g1" });
  });

  it("allows en passant", () => {
    const { send, onMove } = setup("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3");
    expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e5", "d6")).toBe(true);
    expect(onMove).toHaveBeenCalledWith({ from: "e5", to: "d6" });
  });

  describe("promotion", () => {
    const fen = "k7/4P3/8/8/8/8/8/K7 w - - 0 1";

    it("opens the promotion dialog instead of moving straight away", () => {
      const { board, onMove, send } = setup(fen);
      expect(send(INPUT_EVENT_TYPE.validateMoveInput, "e7", "e8")).toBe(true);
      expect(board.showPromotionDialog).toHaveBeenCalledWith("e8", "w", expect.any(Function));
      expect(onMove).not.toHaveBeenCalled();
    });

    it("plays the chosen piece", () => {
      const { onMove, send, choosePiece } = setup(fen);
      send(INPUT_EVENT_TYPE.validateMoveInput, "e7", "e8");
      choosePiece({ type: "pieceSelected", square: "e8", piece: "wn" });
      expect(onMove).toHaveBeenCalledWith({ from: "e7", to: "e8", promotion: "n" });
    });

    it("puts the pawn back when the dialog is cancelled", () => {
      const { board, game, onMove, send, choosePiece } = setup(fen);
      send(INPUT_EVENT_TYPE.validateMoveInput, "e7", "e8");
      choosePiece({ type: "canceled" });
      expect(onMove).not.toHaveBeenCalled();
      expect(board.setPosition).toHaveBeenCalledWith(game.fen, true);
    });

    it("puts the pawn back when the chosen promotion is refused", () => {
      const { board, game, send, choosePiece } = setup(fen, false);
      send(INPUT_EVENT_TYPE.validateMoveInput, "e7", "e8");
      choosePiece({ type: "pieceSelected", square: "e8", piece: "wq" });
      expect(board.setPosition).toHaveBeenCalledWith(game.fen, true);
    });

    it("uses Black's colour for Black's promotion", () => {
      const { board, send } = setup("k7/8/8/8/8/8/4p3/K7 b - - 0 1");
      send(INPUT_EVENT_TYPE.validateMoveInput, "e2", "e1");
      expect(board.showPromotionDialog).toHaveBeenCalledWith("e1", "b", expect.any(Function));
    });
  });

  it("clears the markers when a move is cancelled or finished", () => {
    const { board, send } = setup();
    send(INPUT_EVENT_TYPE.moveInputCanceled);
    send(INPUT_EVENT_TYPE.moveInputFinished);
    expect(board.removeLegalMovesMarkers).toHaveBeenCalledTimes(2);
  });

  it("ignores events it doesn't handle", () => {
    const { board, onMove, send } = setup();
    expect(send(INPUT_EVENT_TYPE.movingOverSquare, "e2", "e3")).toBeUndefined();
    expect(onMove).not.toHaveBeenCalled();
    expect(board.addLegalMovesMarkers).not.toHaveBeenCalled();
  });
});
