import { Chess, type Move } from "chess.js";
import { START_FEN } from "./fen";
import type { MoveInput } from "./game";

/**
 * A practice card: a position, and the line of moves that answers it.
 * The answer is the move (or moves) played in a real game. Nothing here is an
 * engine evaluation, so other good moves may exist; the card only checks that
 * you found the one from the game.
 */
export type PracticeCard = {
  id: string;
  title: string;
  /** Where the position comes from. */
  source: string;
  instruction: string;
  hint: string;
  explanation: string;
  startFen: string;
  /** Every move from the start position, alternating you and the opponent. */
  line: Move[];
  /** On the final move, any checkmate counts, not only the one in the game. */
  anyMateOnFinalMove: boolean;
};

export type CardSpec = {
  id: string;
  title: string;
  source: string;
  instruction: string;
  hint: string;
  explanation: string;
  /** The whole game as SAN moves. */
  game: string[];
  /** Number of half-moves already played when the card starts. */
  startPly: number;
  /** Number of half-moves played when the card ends. */
  endPly: number;
  anyMateOnFinalMove?: boolean;
};

export function buildCard(spec: CardSpec): PracticeCard {
  const chess = new Chess(START_FEN);
  let startFen = START_FEN;
  const line: Move[] = [];
  spec.game.slice(0, spec.endPly).forEach((san, index) => {
    if (index === spec.startPly) startFen = chess.fen();
    const move = chess.move(san);
    if (index >= spec.startPly) line.push(move);
  });
  return { ...spec, startFen, line, anyMateOnFinalMove: spec.anyMateOnFinalMove ?? false };
}

/** Whether the person is the one moving at this index of the line (0 = first move). */
export function isPlayerMove(index: number): boolean {
  return index % 2 === 0;
}

export function playerMoveCount(card: PracticeCard): number {
  return Math.ceil(card.line.length / 2);
}

/**
 * Checks a move the person has just made against the card's answer.
 * `fenBefore` is the position the move was played from.
 */
export function isCorrectAnswer(card: PracticeCard, index: number, fenBefore: string, attempt: MoveInput): boolean {
  const expected = card.line[index];
  if (!expected) return false;
  if (attempt.from === expected.from && attempt.to === expected.to && (attempt.promotion ?? undefined) === expected.promotion) {
    return true;
  }
  if (card.anyMateOnFinalMove && index === card.line.length - 1) {
    const chess = new Chess(fenBefore);
    try {
      return chess.move({ from: attempt.from, to: attempt.to, promotion: attempt.promotion }).san.endsWith("#");
    } catch {
      return false;
    }
  }
  return false;
}
