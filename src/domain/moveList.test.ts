import { describe, expect, it } from "vitest";
import { START_FEN } from "./fen";
import { formatMoveList } from "./moveList";

describe("formatMoveList", () => {
  it("numbers moves from the starting position", () => {
    expect(formatMoveList(START_FEN, ["e4", "e5", "Nf3"])).toBe("1. e4 e5 2. Nf3");
  });

  it("returns an empty string when no moves were played", () => {
    expect(formatMoveList(START_FEN, [])).toBe("");
  });

  it("starts with an ellipsis when Black moves first", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3";
    expect(formatMoveList(fen, ["Nf6", "d4", "exd4"])).toBe("3... Nf6 4. d4 exd4");
  });

  it("continues the numbering from a later move number", () => {
    const fen = "r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2P1PN2/PP1N1PPP/R1BQKB1R w KQkq - 0 7";
    expect(formatMoveList(fen, ["Bd3", "Bd6"])).toBe("7. Bd3 Bd6");
  });
});
