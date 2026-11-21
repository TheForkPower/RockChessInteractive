import { Chess, validateFen } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type ParsedFen = { ok: true; fen: string } | { ok: false; error: string };

/**
 * Validates a FEN typed or pasted by a person and returns the normalised
 * version. A four-field FEN (no move counters) is accepted and completed.
 * chess.js checks the structure (ranks, kings, pawns on the edge rows). On top
 * of that, the side that is not to move must not be in check.
 */
export function parseFen(input: string): ParsedFen {
  const cleaned = input.trim().replace(/\s+/g, " ");
  if (!cleaned) return { ok: false, error: "Enter a FEN to set the position." };

  const candidate = cleaned.split(" ").length === 4 ? `${cleaned} 0 1` : cleaned;

  const checked = validateFen(candidate);
  if (!checked.ok) return { ok: false, error: describeFenError(checked.error ?? "") };

  let chess: Chess;
  try {
    chess = new Chess(candidate);
  } catch (error) {
    return { ok: false, error: describeFenError(error instanceof Error ? error.message : String(error)) };
  }

  const toMove = chess.turn();
  const waiting = toMove === "w" ? "b" : "w";
  for (const rank of chess.board()) {
    for (const square of rank) {
      if (square && square.type === "k" && square.color === waiting && chess.isAttacked(square.square, toMove)) {
        return {
          ok: false,
          error: `${waiting === "w" ? "White" : "Black"} is in check but it isn't ${waiting === "w" ? "White" : "Black"}'s move. That can't happen in a real game.`,
        };
      }
    }
  }

  return { ok: true, fen: chess.fen() };
}

function describeFenError(message: string): string {
  const detail = message.replace(/^invalid fen:?\s*/i, "").trim();
  if (!detail) return "That isn't a valid FEN.";
  return `That isn't a valid FEN: ${detail.charAt(0).toLowerCase()}${detail.slice(1)}${detail.endsWith(".") ? "" : "."}`;
}
