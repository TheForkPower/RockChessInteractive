import { useLayoutEffect } from "react";
import { act } from "@testing-library/react";
import type { BoardProps } from "../board/Board";
import type { MoveInput } from "../domain/game";

/** Stand-in for the real board in component tests: records its props and lets a test "drop" a move. */
export const boardProps: { current: BoardProps | null } = { current: null };

export function Board(props: BoardProps) {
  // A layout effect, so the props are recorded in the same commit that puts the board on screen. A passive
  // effect can run a moment later, and a test that has just seen the board would drop a move too early.
  useLayoutEffect(() => {
    boardProps.current = props;
  });
  return (
    <div
      role="group"
      aria-label={props.label}
      data-testid="board"
      data-fen={props.fen}
      data-orientation={props.orientation}
      data-interactive={String(props.interactive)}
      data-last-move={props.lastMove ? `${props.lastMove.from}${props.lastMove.to}` : ""}
    />
  );
}

/** Plays a move as if the person dropped a piece on the board. Returns whether the move was accepted. */
export function dropMove(move: MoveInput): boolean {
  let accepted = false;
  act(() => {
    accepted = boardProps.current?.onMove?.(move) ?? false;
  });
  return accepted;
}
