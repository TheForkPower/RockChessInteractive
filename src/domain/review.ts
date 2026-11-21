import { Chess } from "chess.js";
import { answerText, type Card, type CardMove } from "./cards";
import type { MoveInput } from "./game";

/** One move of a card's answer, and who plays it: the learner, or the opponent's reply. */
export type Step = { move: CardMove; mover: "you" | "opponent" };

/** Splits a card's answer into the moves you play and the replies played for the opponent. */
export function planCard(card: Card): Step[] {
  const chess = new Chess(card.fen);
  return card.answer.map((move) => {
    const mover = chess.turn() === card.side ? "you" : "opponent";
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    return { move, mover };
  });
}

const sameMove = (expected: Pick<CardMove, "from" | "to" | "promotion">, attempt: MoveInput) =>
  expected.from === attempt.from && expected.to === attempt.to && (expected.promotion ?? undefined) === (attempt.promotion ?? undefined);

/**
 * Whether the move a learner made is the one the card wants at this step.
 * Other accepted moves count only as the first move of a single-move card.
 * Nothing here judges whether a move is good: it only compares with what the card stores.
 */
export function judgeMove(card: Card, stepIndex: number, attempt: MoveInput): "answer" | "alternative" | "wrong" {
  const expected = card.answer[stepIndex];
  if (expected && sameMove(expected, attempt)) return "answer";
  if (card.kind === "move" && stepIndex === 0 && card.alternatives.some((move) => sameMove(move, attempt))) return "alternative";
  return "wrong";
}

export type Tally = {
  /** Wrong moves tried. */
  mistakes: number;
  hintUsed: boolean;
  /** The learner gave up and asked to see the answer. */
  revealed: boolean;
  /** Moves of yours that were right before the card ended. */
  played: number;
};

/**
 * - first-try: every move right, no hint, no peeking
 * - with-help: finished, but after a wrong move or a hint
 * - partial: some moves right, then the answer was shown
 * - shown: the answer was shown before any right move
 */
export type Outcome = "first-try" | "with-help" | "partial" | "shown";

export function outcomeOf(tally: Tally): Outcome {
  if (tally.revealed) return tally.played > 0 ? "partial" : "shown";
  return tally.mistakes > 0 || tally.hintUsed ? "with-help" : "first-try";
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  "first-try": "Right first time",
  "with-help": "Right, with a hint or a second try",
  partial: "Part of it right",
  shown: "Answer shown",
};

/** PGN movetext for the back of a card: its saved continuation, or just the answer if it has none. */
export function backText(card: Card): string {
  return card.continuation.trim() !== "" ? card.continuation : answerText(card.fen, card.answer);
}
