import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./fen";
import {
  castlingPossible,
  clearedSetup,
  fenToSetup,
  movePiece,
  placePiece,
  removePiece,
  setupToFen,
  squareName,
  startSetup,
} from "./boardSetup";

describe("board setup", () => {
  it("round-trips the starting position", () => {
    expect(setupToFen(startSetup())).toBe(START_FEN);
  });

  it("round-trips a middlegame FEN", () => {
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
    expect(setupToFen(fenToSetup(fen)!)).toBe(fen);
  });

  it("names squares in FEN order", () => {
    expect(squareName(0)).toBe("a8");
    expect(squareName(7)).toBe("h8");
    expect(squareName(56)).toBe("a1");
    expect(squareName(63)).toBe("h1");
    expect(squareName(36)).toBe("e4");
  });

  it("drops castling rights that can't exist", () => {
    let setup = startSetup();
    setup = { ...setup, squares: removePiece(setup.squares, 63) }; // h1 rook
    expect(castlingPossible(setup.squares)).toEqual({ K: false, Q: true, k: true, q: true });
    expect(setupToFen(setup)).toContain(" w Qkq ");
  });

  it("writes a dash when no castling is possible", () => {
    expect(setupToFen(clearedSetup())).toBe("8/8/8/8/8/8/8/8 w - - 0 1");
  });

  it("places a piece, and a second click with the same piece takes it off", () => {
    const empty = clearedSetup().squares;
    const once = placePiece(empty, 36, { color: "w", type: "n" });
    expect(once[36]).toEqual({ color: "w", type: "n" });
    expect(placePiece(once, 36, { color: "w", type: "n" })[36]).toBeNull();
    expect(placePiece(once, 36, { color: "b", type: "n" })[36]).toEqual({ color: "b", type: "n" });
  });

  it("moves a piece and takes what was on the target", () => {
    const start = startSetup().squares;
    const next = movePiece(start, 52, 36); // e2 to e4
    expect(next[52]).toBeNull();
    expect(next[36]).toEqual({ color: "w", type: "p" });
    expect(movePiece(start, 36, 28)).toBe(start); // empty origin changes nothing
  });

  it("produces a FEN the app's own checker accepts", () => {
    const setup = { ...clearedSetup() };
    let squares = placePiece(setup.squares, 60, { color: "w", type: "k" });
    squares = placePiece(squares, 4, { color: "b", type: "k" });
    squares = placePiece(squares, 48, { color: "w", type: "p" });
    const parsed = parseFen(setupToFen({ ...setup, squares }));
    expect(parsed.ok).toBe(true);
  });

  it("rejects an unreadable board", () => {
    expect(fenToSetup("nonsense")).toBeNull();
  });
});
