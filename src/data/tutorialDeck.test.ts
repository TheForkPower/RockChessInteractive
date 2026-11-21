import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { checkContinuation } from "../domain/cards";
import { buildTutorialCards, tutorialAnswerLabels } from "./tutorialDeck";

describe("tutorial deck", () => {
  const cards = buildTutorialCards();

  it("builds ten cards", () => {
    expect(cards).toHaveLength(10);
  });

  it("starts with the card that explains how cards work", () => {
    expect(cards[0].prompt).toMatch(/good first move/i);
    expect(cards[0].alternatives.length).toBe(1);
  });

  it("every answer is legal from the card's position", () => {
    for (const card of cards) {
      const chess = new Chess(card.fen);
      for (const move of card.answer) {
        expect(() => chess.move(move.san), `${card.prompt}: ${move.san}`).not.toThrow();
      }
    }
  });

  it("every continuation is legal from the card's position", () => {
    for (const card of cards) {
      const result = checkContinuation(card.fen, card.continuation);
      expect(result.ok, `${card.prompt}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it("the cards that promise mate end in mate", () => {
    const mates = cards.filter((card) => /mate/i.test(card.prompt) || /#/.test(card.explanation));
    expect(mates.length).toBeGreaterThan(3);
    for (const card of cards.filter((c) => c.kind === "line" && /mate/i.test(c.prompt))) {
      const chess = new Chess(card.fen);
      for (const move of card.answer) chess.move(move.san);
      expect(chess.isCheckmate(), card.prompt).toBe(true);
    }
  });

  it("answers the right side to move", () => {
    for (const card of cards) {
      expect(new Chess(card.fen).turn()).toBe(card.side);
    }
  });

  it("labels the answers", () => {
    expect(tutorialAnswerLabels()).toEqual([
      "1. e4",
      "5. Nxe5",
      "18. Bd6",
      "20. Rxe7+",
      "16. Qb8+",
      "15. Bxh7+",
      "9. Qd8+",
      "17... Be6",
      "8. Nxe6",
      "24. Rxd4",
    ]);
  });
});
