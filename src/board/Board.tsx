import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, type BoardColor, type MarkerType } from "cm-chessboard/src/Chessboard.js";
import { Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { PromotionDialog } from "cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "cm-chessboard/assets/extensions/promotion-dialog/promotion-dialog.css";
import piecesUrl from "cm-chessboard/assets/pieces/standard.svg?url";
import markersUrl from "cm-chessboard/assets/extensions/markers/markers.svg?url";
import "./board.css";
import { Game, type MoveInput } from "../domain/game";
import { createMoveInputHandler } from "./moveInput";

const LAST_MOVE: MarkerType = { class: "marker-last-move", slice: "markerSquare" };

export type BoardProps = {
  /** The position to show. The board follows this; it never keeps its own copy. */
  fen: string;
  orientation?: BoardColor;
  /** Who may move pieces: the side to move, one colour, or nobody. */
  interactive?: "turn" | BoardColor | false;
  /**
   * Called with a legal move the person has made. Return true to accept it, or
   * false to refuse it and send the piece back.
   */
  onMove?: (move: MoveInput) => boolean;
  /** Squares to highlight as the last move. */
  lastMove?: { from: string; to: string } | null;
  /** Spoken description of the board for screen readers. */
  label?: string;
};

const sideToMove = (fen: string): BoardColor => (fen.split(" ")[1] === "b" ? "b" : "w");

export function Board({ fen, orientation = "w", interactive = "turn", onMove, lastMove = null, label = "Chessboard" }: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<Chessboard | null>(null);

  // The handler reads the newest props through this ref, so it can be created once.
  const latest = useRef({ fen, onMove });
  useEffect(() => {
    latest.current = { fen, onMove };
  });

  const handlerRef = useRef<ReturnType<typeof createMoveInputHandler> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const board = new Chessboard(container, {
      position: latest.current.fen,
      orientation,
      assetsUrl: "/",
      style: {
        cssClass: "rockchess",
        showCoordinates: true,
        borderType: BORDER_TYPE.none,
        pieces: { file: piecesUrl },
        animationDuration: 220,
      },
      extensions: [{ class: Markers, props: { sprite: markersUrl } }, { class: PromotionDialog }],
    });
    boardRef.current = board;

    handlerRef.current = createMoveInputHandler(() => ({
      board,
      game: new Game(latest.current.fen),
      onMove: (move) => latest.current.onMove?.(move) ?? false,
    }));

    return () => {
      board.destroy();
      boardRef.current = null;
      handlerRef.current = null;
    };
    // The board is created once. Later changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void boardRef.current?.setPosition(fen, true);
  }, [fen]);

  useEffect(() => {
    const board = boardRef.current;
    if (board && board.getOrientation() !== orientation) void board.setOrientation(orientation, true);
  }, [orientation]);

  const lastFrom = lastMove?.from ?? null;
  const lastTo = lastMove?.to ?? null;
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    board.removeMarkers(LAST_MOVE);
    if (lastFrom && lastTo) {
      board.addMarker(LAST_MOVE, lastFrom);
      board.addMarker(LAST_MOVE, lastTo);
    }
  }, [lastFrom, lastTo]);

  // Only whether a handler exists matters here, not which function it is, so a
  // parent re-rendering mid-move doesn't cancel the move being made.
  const acceptsMoves = Boolean(onMove);
  useEffect(() => {
    const board = boardRef.current;
    const handler = handlerRef.current;
    if (!board || !handler) return;
    board.cancelMoveInput();
    board.disableMoveInput();
    const color = interactive === "turn" ? sideToMove(fen) : interactive;
    if (color && acceptsMoves) board.enableMoveInput(handler, color);
  }, [fen, interactive, acceptsMoves]);

  return (
    <div className="board-frame" role="group" aria-label={label}>
      <div ref={containerRef} />
    </div>
  );
}
