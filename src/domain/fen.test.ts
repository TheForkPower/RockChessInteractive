import { describe, expect, it } from "vitest";
import { parseFen, START_FEN } from "./fen";

describe("parseFen", () => {
  it("accepts the starting position", () => {
    expect(parseFen(START_FEN)).toEqual({ ok: true, fen: START_FEN });
  });

  it("trims and collapses whitespace", () => {
    const result = parseFen(`  ${START_FEN.replace(/ /g, "   ")}\n`);
    expect(result).toEqual({ ok: true, fen: START_FEN });
  });

  it("completes a four-field FEN with move counters", () => {
    const result = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
    expect(result).toEqual({ ok: true, fen: START_FEN });
  });

  it("keeps the side to move, castling rights and en passant square", () => {
    const fen = "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
    const result = parseFen(fen);
    expect(result).toEqual({ ok: true, fen });
  });

  it("rejects an empty string with a clear prompt", () => {
    expect(parseFen("   ")).toEqual({ ok: false, error: "Enter a FEN to set the position." });
  });

  it.each([
    ["garbage", "not a fen"],
    ["too few ranks", "rnbqkbnr/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
    ["a bad piece letter", "rnbqkbnx/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
    ["a bad side to move", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1"],
    ["a rank with nine squares", "rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
  ])("rejects %s", (_label, fen) => {
    const result = parseFen(fen);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^That isn't a valid FEN: /);
  });

  it("rejects a position with a missing king", () => {
    expect(parseFen("8/8/8/8/8/8/8/4K3 w - - 0 1")).toEqual({
      ok: false,
      error: "That isn't a valid FEN: missing black king.",
    });
  });

  it("rejects two kings of one colour", () => {
    expect(parseFen("k7/8/8/8/8/8/8/K1K5 w - - 0 1")).toEqual({
      ok: false,
      error: "That isn't a valid FEN: too many white kings.",
    });
  });

  it("rejects a pawn on the first or last rank", () => {
    expect(parseFen("k6P/8/8/8/8/8/8/K7 w - - 0 1")).toEqual({
      ok: false,
      error: "That isn't a valid FEN: some pawns are on the edge rows.",
    });
  });

  it("rejects a position where the side not to move is in check", () => {
    // White's rook gives check to the black king, but it is White to move.
    const result = parseFen("k3R3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Black is in check but it isn't Black's move/);
  });

  it("accepts a position where the side to move is in check", () => {
    expect(parseFen("k3R3/8/8/8/8/8/8/4K3 b - - 0 1").ok).toBe(true);
  });
});
