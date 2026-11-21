import { describe, expect, it } from "vitest";
import { START_FEN } from "./fen";
import { Game, describeStatus } from "./game";

describe("Game", () => {
  it("starts with twenty legal moves for White", () => {
    const game = new Game();
    expect(game.turn).toBe("w");
    expect(game.legalMoves()).toHaveLength(20);
  });

  it("lists legal moves from one square only", () => {
    const game = new Game();
    expect(game.legalMoves("e2").map((m) => m.to).sort()).toEqual(["e3", "e4"]);
    expect(game.legalMoves("e7")).toEqual([]); // Black's pawn, White to move
    expect(game.legalMoves("e4")).toEqual([]); // empty square
  });

  it("plays a legal move and passes the turn", () => {
    const game = new Game();
    const move = game.move({ from: "e2", to: "e4" });
    expect(move?.san).toBe("e4");
    expect(game.turn).toBe("b");
    expect(game.fen).toContain("4P3");
  });

  it("refuses an illegal move and leaves the position unchanged", () => {
    const game = new Game();
    expect(game.move({ from: "e2", to: "e5" })).toBeNull();
    expect(game.move({ from: "e7", to: "e5" })).toBeNull(); // wrong side
    expect(game.move({ from: "a1", to: "a3" })).toBeNull(); // blocked rook
    expect(game.fen).toBe(START_FEN);
  });

  it("refuses to move a pinned piece off the pin line", () => {
    // The bishop on e2 shields the king from the rook on e8.
    const game = new Game("4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1");
    expect(game.move({ from: "e2", to: "d3" })).toBeNull();
  });

  it("plays both castling moves and moves the rook too", () => {
    const short = new Game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(short.move({ from: "e1", to: "g1" })?.san).toBe("O-O");
    expect(short.fen.split(" ")[0]).toBe("r3k2r/8/8/8/8/8/8/R4RK1");

    const long = new Game("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1");
    expect(long.move({ from: "e8", to: "c8" })?.san).toBe("O-O-O");
    expect(long.fen.split(" ")[0]).toBe("2kr3r/8/8/8/8/8/8/R3K2R");
  });

  it("refuses to castle through check or after the king has lost the right", () => {
    const attacked = new Game("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1");
    expect(attacked.move({ from: "e1", to: "g1" })).toBeNull(); // f1 is attacked
    const noRights = new Game("r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1");
    expect(noRights.move({ from: "e1", to: "g1" })).toBeNull();
  });

  it("allows en passant and removes the captured pawn", () => {
    const game = new Game();
    for (const san of ["e4", "a6", "e5", "d5"]) expect(game.moveSan(san)).not.toBeNull();
    const move = game.move({ from: "e5", to: "d6" });
    expect(move?.san).toBe("exd6");
    expect(move?.flags).toContain("e");
    expect(game.fen.split(" ")[0]).toBe("rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR");
  });

  it("only allows en passant on the move immediately after the double step", () => {
    const game = new Game();
    for (const san of ["e4", "a6", "e5", "d5", "a3", "a5"]) expect(game.moveSan(san)).not.toBeNull();
    expect(game.move({ from: "e5", to: "d6" })).toBeNull();
  });

  it("asks for a promotion piece and rejects a promotion without one", () => {
    const game = new Game("k7/4P3/8/8/8/8/8/K7 w - - 0 1");
    expect(game.needsPromotion("e7", "e8")).toBe(true);
    expect(game.needsPromotion("a1", "a2")).toBe(false);
    expect(game.move({ from: "e7", to: "e8" })).toBeNull();
    const move = game.move({ from: "e7", to: "e8", promotion: "n" });
    expect(move?.san).toBe("e8=N");
    expect(game.fen.split(" ")[0]).toBe("k3N3/8/8/8/8/8/8/K7");
  });

  it("promotes with capture to each piece", () => {
    for (const piece of ["q", "r", "b", "n"] as const) {
      const game = new Game("k2r4/4P3/8/8/8/8/8/K7 w - - 0 1");
      expect(game.needsPromotion("e7", "d8")).toBe(true);
      expect(game.move({ from: "e7", to: "d8", promotion: piece })?.promotion).toBe(piece);
    }
  });

  it("plays moves written in algebraic notation and rejects bad ones", () => {
    const game = new Game();
    expect(game.moveSan("Nf3")?.from).toBe("g1");
    expect(game.moveSan("Nf3")).toBeNull(); // Black's turn, no Black knight on f3 route
    expect(game.moveSan("zz9")).toBeNull();
  });

  it("undoes a move", () => {
    const game = new Game();
    game.moveSan("e4");
    expect(game.undo()?.san).toBe("e4");
    expect(game.fen).toBe(START_FEN);
    expect(game.undo()).toBeNull();
  });

  it("remembers the starting position and the moves played from it", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    const game = new Game(fen);
    game.moveSan("e5");
    expect(game.startFen).toBe(fen);
    expect(game.history()).toEqual(["e5"]);
    expect(game.lastMove()?.to).toBe("e5");
  });
});

describe("game status", () => {
  it("reports play, check, checkmate, stalemate and draws", () => {
    const game = new Game();
    expect(game.status()).toEqual({ state: "playing", check: false });
    expect(describeStatus(game)).toBe("White to move.");

    for (const san of ["f3", "e5", "g4", "Qh4#"]) game.moveSan(san);
    expect(game.status()).toEqual({ state: "checkmate", check: true, winner: "b" });
    expect(describeStatus(game)).toBe("Checkmate. Black wins.");

    const check = new Game("k3R3/8/8/8/8/8/8/4K3 b - - 0 1");
    expect(describeStatus(check)).toBe("Black to move, in check.");

    const stalemate = new Game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(stalemate.status().state).toBe("stalemate");
    expect(describeStatus(stalemate)).toBe("Stalemate. The game is drawn.");

    const bare = new Game("8/8/8/4k3/8/8/4K3/8 w - - 0 1");
    expect(describeStatus(bare)).toBe("Draw by insufficient material.");
  });

  it("detects a draw by threefold repetition", () => {
    const game = new Game();
    for (const san of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) game.moveSan(san);
    expect(describeStatus(game)).toBe("Draw by threefold repetition.");
  });
});
