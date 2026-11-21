import { describe, expect, it } from "vitest";
import { buildTutorialCards } from "../data/tutorialDeck";
import type { Card, CardMove } from "./cards";
import { backText, judgeMove, outcomeOf, planCard, splitPrompt } from "./review";

const base = buildTutorialCards();
const card = (index: number, patch: Partial<Card> = {}): Card => ({
  ...base[index],
  id: `c${index}`,
  deckId: "d",
  createdAt: 0,
  updatedAt: 0,
  ...patch,
});

const move = (from: string, to: string, san: string, promotion?: CardMove["promotion"]): CardMove => ({ from, to, san, ...(promotion ? { promotion } : {}) });

describe("planning a card", () => {
  it("gives a single-move card one step for you", () => {
    const plan = planCard(card(0)); // Légal's Mate: Nxe5
    expect(plan).toHaveLength(1);
    expect(plan[0].mover).toBe("you");
    expect(plan[0].move.san).toBe("Nxe5");
  });

  it("alternates you and the opponent on a line card", () => {
    const evergreen = card(2); // 20. Rxe7+ ... nine plies
    const plan = planCard(evergreen);
    expect(plan.map((step) => step.mover)).toEqual(["you", "opponent", "you", "opponent", "you", "opponent", "you", "opponent", "you"]);
    expect(plan[plan.length - 1].move.san).toBe("Bxe7#");
  });

  it("starts with the opponent when the card begins on their turn", () => {
    const line = card(2);
    const plan = planCard({ ...line, side: line.side === "w" ? "b" : "w" });
    expect(plan[0].mover).toBe("opponent");
  });
});

describe("judging a move", () => {
  const first = card(0);

  it("accepts the card's move", () => {
    const answer = first.answer[0];
    expect(judgeMove(first, 0, { from: answer.from, to: answer.to })).toBe("answer");
  });

  it("refuses any other move", () => {
    expect(judgeMove(first, 0, { from: "d2", to: "d4" })).toBe("wrong");
  });

  it("accepts an alternative on a single-move card", () => {
    const withAlt = { ...first, alternatives: [move("f3", "g5", "Ng5")] };
    expect(judgeMove(withAlt, 0, { from: "f3", to: "g5" })).toBe("alternative");
  });

  it("ignores alternatives on a line card", () => {
    const line = card(2);
    const attempt = { from: "a1", to: "a2" };
    expect(judgeMove({ ...line, alternatives: [move("a1", "a2", "Ra2")] }, 0, attempt)).toBe("wrong");
  });

  it("compares the promotion piece", () => {
    const promo = { ...first, answer: [move("a7", "a8", "a8=Q", "q")], alternatives: [] };
    expect(judgeMove(promo, 0, { from: "a7", to: "a8", promotion: "q" })).toBe("answer");
    expect(judgeMove(promo, 0, { from: "a7", to: "a8", promotion: "n" })).toBe("wrong");
  });

  it("refuses a move past the end of the answer", () => {
    expect(judgeMove(first, 3, { from: "e2", to: "e4" })).toBe("wrong");
  });
});

describe("outcomes", () => {
  const tally = { mistakes: 0, hintUsed: false, revealed: false, played: 1 };
  it("tells the four apart", () => {
    expect(outcomeOf(tally)).toBe("first-try");
    expect(outcomeOf({ ...tally, mistakes: 1 })).toBe("with-help");
    expect(outcomeOf({ ...tally, hintUsed: true })).toBe("with-help");
    expect(outcomeOf({ ...tally, revealed: true })).toBe("partial");
    expect(outcomeOf({ ...tally, revealed: true, played: 0 })).toBe("shown");
  });
});

describe("the back of a card", () => {
  it("uses the saved continuation", () => {
    expect(backText(card(0))).toBe(card(0).continuation);
  });

  it("falls back to the answer when there's no continuation", () => {
    expect(backText(card(0, { continuation: "  " }))).toBe("5. Nxe5");
  });
});

describe("splitting the question", () => {
  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  it("puts the side to move on its own and keeps the rest as detail", () => {
    expect(splitPrompt({ fen, prompt: "White to move. Both your rooks are attacked. Find the quiet move." })).toEqual({
      heading: "White to move",
      detail: "Both your rooks are attacked. Find the quiet move.",
    });
  });

  it("has no detail when the question is only the side to move", () => {
    expect(splitPrompt({ fen, prompt: "Black to move." })).toEqual({ heading: "Black to move", detail: "" });
  });

  it("adds the side to move when the author didn't write it", () => {
    expect(splitPrompt({ fen: fen.replace(" w ", " b "), prompt: "Find the best reply." })).toEqual({
      heading: "Black to move",
      detail: "Find the best reply.",
    });
  });
});
