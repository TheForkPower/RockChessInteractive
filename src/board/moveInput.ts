import { INPUT_EVENT_TYPE, type BoardColor, type MoveInputEvent, type PromotionResult } from "cm-chessboard/src/Chessboard.js";
import type { MoveInput, PromotionPiece } from "../domain/game";

type LegalMove = { from: string; to: string; promotion?: string };

/** The parts of the board the move handler uses. The real Chessboard satisfies this. */
export type BoardPort = {
  addLegalMovesMarkers(moves: LegalMove[]): void;
  removeLegalMovesMarkers(): void;
  showPromotionDialog(square: string, color: BoardColor, callback: (result: PromotionResult) => void): void;
  setPosition(fen: string, animated?: boolean): unknown;
};

/** The parts of the game the move handler reads. `Game` satisfies this. */
export type GamePort = {
  readonly fen: string;
  readonly turn: BoardColor;
  legalMoves(from?: string): LegalMove[];
  needsPromotion(from: string, to: string): boolean;
};

export type MoveInputDeps = {
  board: BoardPort;
  game: GamePort;
  /**
   * Called with a move that is legal in the position. Return true to accept it
   * (the board keeps the piece where it landed) or false to refuse it (the
   * piece snaps back).
   */
  onMove: (move: MoveInput) => boolean;
};

/**
 * Builds the handler passed to cm-chessboard's enableMoveInput. `getDeps` is
 * read on every event so the handler always sees the current game and callback.
 *
 * Only legal moves ever reach `onMove`: the board library decides nothing about
 * chess, and this handler asks the game before anything moves.
 */
export function createMoveInputHandler(getDeps: () => MoveInputDeps) {
  return (event: MoveInputEvent): boolean | void => {
    const { board, game, onMove } = getDeps();

    switch (event.type) {
      case INPUT_EVENT_TYPE.moveInputStarted: {
        board.removeLegalMovesMarkers();
        const moves = event.squareFrom ? game.legalMoves(event.squareFrom) : [];
        if (moves.length === 0) return false;
        board.addLegalMovesMarkers(moves);
        return true;
      }

      case INPUT_EVENT_TYPE.validateMoveInput: {
        board.removeLegalMovesMarkers();
        const { squareFrom: from, squareTo: to } = event;
        if (!from || !to) return false;
        if (!game.legalMoves(from).some((move) => move.to === to)) return false;

        if (game.needsPromotion(from, to)) {
          board.showPromotionDialog(to, game.turn, (result) => {
            const current = getDeps();
            if (result.type === "pieceSelected") {
              const promotion = result.piece.charAt(1) as PromotionPiece;
              if (current.onMove({ from, to, promotion })) return;
            }
            // Cancelled, or the move was refused: put the pawn back.
            current.board.setPosition(current.game.fen, true);
          });
          return true;
        }

        return onMove({ from, to });
      }

      case INPUT_EVENT_TYPE.moveInputCanceled:
      case INPUT_EVENT_TYPE.moveInputFinished:
        board.removeLegalMovesMarkers();
        return;

      default:
        return;
    }
  };
}
