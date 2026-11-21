import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { Game } from "./game";
import { isCorrectAnswer, isPlayerMove, playerMoveCount } from "./practice";
import { practiceCards } from "./practiceCards";

const byId = (id: string) => practiceCards.find((card) => card.id === id)!;

describe("practice cards", () => {
  it("has four cards with unique ids", () => {
    expect(practiceCards).toHaveLength(4);
    expect(new Set(practiceCards.map((c) => c.id)).size).toBe(4);
  });

  it.each(practiceCards.map((card) => [card.id, card] as const))("%s: the whole line is legal and White moves first", (_id, card) => {
    const game = new Game(card.startFen);
    expect(game.turn).toBe("w");
    for (const move of card.line) {
      expect(game.move({ from: move.from, to: move.to, promotion: move.promotion as never })).not.toBeNull();
    }
  });

  it.each(practiceCards.map((card) => [card.id, card] as const))("%s: ends in checkmate or check as described", (id, card) => {
    const game = new Game(card.startFen);
    for (const move of card.line) game.moveSan(move.san);
    if (id === "immortal-quiet-move") {
      expect(game.status().state).toBe("playing");
    } else if (id === "opera-queen-sacrifice") {
      expect(game.status().state).toBe("playing");
    } else {
      expect(game.status().state).toBe("checkmate");
    }
  });

  it("starts each card at the right place in the game", () => {
    expect(byId("opera-mate").line.map((m) => m.san)).toEqual(["Rd8#"]);
    expect(byId("opera-queen-sacrifice").line.map((m) => m.san)).toEqual(["Qb8+", "Nxb8"]);
    expect(byId("immortal-quiet-move").line.map((m) => m.san)).toEqual(["Bd6"]);
    expect(byId("immortal-finish").line.map((m) => m.san)).toEqual(["Nxg7+", "Kd8", "Qf6+", "Nxf6", "Be7#"]);
  });

  it("counts the moves the player has to find", () => {
    expect(playerMoveCount(byId("opera-mate"))).toBe(1);
    expect(playerMoveCount(byId("opera-queen-sacrifice"))).toBe(1);
    expect(playerMoveCount(byId("immortal-finish"))).toBe(3);
    expect([0, 1, 2, 3, 4].map(isPlayerMove)).toEqual([true, false, true, false, true]);
  });
});

describe("isCorrectAnswer", () => {
  it("accepts the move from the game", () => {
    const card = byId("immortal-quiet-move");
    expect(isCorrectAnswer(card, 0, card.startFen, { from: "c1", to: "d6" })).toBe(false); // bishop is on f4
    expect(isCorrectAnswer(card, 0, card.startFen, { from: "f4", to: "d6" })).toBe(true);
  });

  it("rejects a legal move that is not the answer", () => {
    const card = byId("opera-queen-sacrifice");
    const legal = new Game(card.startFen).legalMoves();
    const wrong = legal.filter((m) => m.san !== "Qb8+");
    expect(wrong.length).toBeGreaterThan(5);
    for (const move of wrong) {
      expect(isCorrectAnswer(card, 0, card.startFen, { from: move.from, to: move.to })).toBe(false);
    }
    expect(isCorrectAnswer(card, 0, card.startFen, { from: "b3", to: "b8" })).toBe(true);
  });

  it("checks the second player move against the position after the replies", () => {
    const card = byId("immortal-finish");
    const chess = new Chess(card.startFen);
    chess.move("Nxg7+");
    chess.move("Kd8");
    const fen = chess.fen();
    expect(isCorrectAnswer(card, 2, fen, { from: "f3", to: "f4" })).toBe(false);
    expect(isCorrectAnswer(card, 2, fen, { from: "f3", to: "f6" })).toBe(true);
  });

  it("accepts any checkmate on the final move of a mate card, and nothing else", () => {
    const card = byId("opera-mate");
    const game = new Game(card.startFen);
    const mates = game.legalMoves().filter((m) => m.san.endsWith("#"));
    expect(mates.length).toBeGreaterThanOrEqual(1);
    for (const mate of mates) {
      expect(isCorrectAnswer(card, 0, card.startFen, { from: mate.from, to: mate.to })).toBe(true);
    }
    const nonMates = game.legalMoves().filter((m) => !m.san.endsWith("#"));
    for (const move of nonMates) {
      expect(isCorrectAnswer(card, 0, card.startFen, { from: move.from, to: move.to })).toBe(false);
    }
  });

  it("does not apply the mate rule to cards that don't ask for it", () => {
    const card = byId("opera-queen-sacrifice");
    expect(card.anyMateOnFinalMove).toBe(false);
  });

  it("rejects an index beyond the line and a move to an illegal square", () => {
    const card = byId("opera-mate");
    expect(isCorrectAnswer(card, 5, card.startFen, { from: "d1", to: "d8" })).toBe(false);
    expect(isCorrectAnswer(card, 0, card.startFen, { from: "a1", to: "a8" })).toBe(false);
  });
});
