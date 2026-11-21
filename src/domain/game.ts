import { Chess, type Color, type Move, type Square } from "chess.js";
import { START_FEN } from "./fen";

export type PromotionPiece = "q" | "r" | "b" | "n";

export type MoveInput = {
  from: string;
  to: string;
  promotion?: PromotionPiece;
};

export type GameStatus = {
  state: "playing" | "checkmate" | "stalemate" | "draw";
  /** The side to move is in check (also true on checkmate). */
  check: boolean;
  /** Set on checkmate: the side that delivered mate. */
  winner?: Color;
  /** Set on a draw. */
  reason?: string;
};

/**
 * A thin wrapper over chess.js that the rest of the app talks to. Move
 * legality, castling, en passant, promotion and game end all come from
 * chess.js; nothing is parsed or validated by hand here.
 */
export class Game {
  private chess: Chess;
  private readonly start: string;

  constructor(fen: string = START_FEN) {
    this.chess = new Chess(fen);
    this.start = fen;
  }

  get fen(): string {
    return this.chess.fen();
  }

  get startFen(): string {
    return this.start;
  }

  get turn(): Color {
    return this.chess.turn();
  }

  /** Legal moves, optionally only those leaving one square. */
  legalMoves(from?: string): Move[] {
    return this.chess.moves({ verbose: true, ...(from ? { square: from as Square } : {}) });
  }

  /** True when moving from → to is a pawn promotion, so a piece must be chosen. */
  needsPromotion(from: string, to: string): boolean {
    return this.legalMoves(from).some((move) => move.to === to && move.promotion !== undefined);
  }

  /** Plays a move if it is legal. Returns the move, or null if it is not allowed. */
  move(input: MoveInput): Move | null {
    try {
      return this.chess.move({ from: input.from, to: input.to, promotion: input.promotion });
    } catch {
      return null;
    }
  }

  /** Plays a move written in standard algebraic notation, such as "Nf3" or "O-O". */
  moveSan(san: string): Move | null {
    try {
      return this.chess.move(san.trim());
    } catch {
      return null;
    }
  }

  undo(): Move | null {
    return this.chess.undo();
  }

  /** Moves played since the starting position, as SAN. */
  history(): string[] {
    return this.chess.history();
  }

  lastMove(): Move | null {
    const moves = this.chess.history({ verbose: true });
    return moves.length > 0 ? moves[moves.length - 1] : null;
  }

  status(): GameStatus {
    const check = this.chess.inCheck();
    if (this.chess.isCheckmate()) {
      return { state: "checkmate", check, winner: this.chess.turn() === "w" ? "b" : "w" };
    }
    if (this.chess.isStalemate()) return { state: "stalemate", check };
    if (this.chess.isInsufficientMaterial()) return { state: "draw", check, reason: "insufficient material" };
    if (this.chess.isThreefoldRepetition()) return { state: "draw", check, reason: "threefold repetition" };
    if (this.chess.isDrawByFiftyMoves()) return { state: "draw", check, reason: "the fifty-move rule" };
    return { state: "playing", check };
  }
}

/** One short line describing whose move it is or how the game ended. */
export function describeStatus(game: Game): string {
  const status = game.status();
  const side = (color: Color) => (color === "w" ? "White" : "Black");
  switch (status.state) {
    case "checkmate":
      return `Checkmate. ${side(status.winner!)} wins.`;
    case "stalemate":
      return "Stalemate. The game is drawn.";
    case "draw":
      return `Draw by ${status.reason}.`;
    default:
      return `${side(game.turn)} to move${status.check ? ", in check" : ""}.`;
  }
}
