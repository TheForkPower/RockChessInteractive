import { START_FEN } from "./fen";

export type PieceColor = "w" | "b";
export type PieceType = "k" | "q" | "r" | "b" | "n" | "p";
export type Piece = { color: PieceColor; type: PieceType };

/** Squares in FEN order: index 0 is a8, index 7 is h8, index 63 is h1. */
export type Squares = (Piece | null)[];

export type Castling = { K: boolean; Q: boolean; k: boolean; q: boolean };

export type Setup = {
  squares: Squares;
  turn: PieceColor;
  /** What the person has ticked. Only rights that are actually possible reach the FEN. */
  castling: Castling;
  moveNumber: number;
};

export const PIECE_TYPES: PieceType[] = ["k", "q", "r", "b", "n", "p"];

export const PIECE_NAMES: Record<PieceType, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export const emptySquares = (): Squares => Array.from({ length: 64 }, () => null);

export function squareName(index: number): string {
  return `${"abcdefgh"[index % 8]}${8 - Math.floor(index / 8)}`;
}

export function pieceName(piece: Piece): string {
  return `${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}`;
}

const same = (a: Piece | null, b: Piece | null) => a?.color === b?.color && a?.type === b?.type;

const at = (squares: Squares, name: string): Piece | null => {
  const file = "abcdefgh".indexOf(name[0]);
  const rank = Number(name[1]);
  return squares[(8 - rank) * 8 + file];
};

/** Which castling rights could exist: the king and the rook must both be on their home squares. */
export function castlingPossible(squares: Squares): Castling {
  const has = (square: string, color: PieceColor, type: PieceType) => same(at(squares, square), { color, type });
  return {
    K: has("e1", "w", "k") && has("h1", "w", "r"),
    Q: has("e1", "w", "k") && has("a1", "w", "r"),
    k: has("e8", "b", "k") && has("h8", "b", "r"),
    q: has("e8", "b", "k") && has("a8", "b", "r"),
  };
}

export function effectiveCastling(setup: Setup): Castling {
  const possible = castlingPossible(setup.squares);
  return {
    K: setup.castling.K && possible.K,
    Q: setup.castling.Q && possible.Q,
    k: setup.castling.k && possible.k,
    q: setup.castling.q && possible.q,
  };
}

export function setupToFen(setup: Setup): string {
  const rows: string[] = [];
  for (let rank = 0; rank < 8; rank += 1) {
    let row = "";
    let gap = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = setup.squares[rank * 8 + file];
      if (!piece) {
        gap += 1;
        continue;
      }
      if (gap > 0) row += String(gap);
      gap = 0;
      row += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
    }
    if (gap > 0) row += String(gap);
    rows.push(row);
  }
  const rights = effectiveCastling(setup);
  const castling = `${rights.K ? "K" : ""}${rights.Q ? "Q" : ""}${rights.k ? "k" : ""}${rights.q ? "q" : ""}` || "-";
  return `${rows.join("/")} ${setup.turn} ${castling} - 0 ${Math.max(1, Math.floor(setup.moveNumber) || 1)}`;
}

/** Reads a FEN that has already been validated. Returns null if the board part can't be read. */
export function fenToSetup(fen: string): Setup | null {
  const [board, turn = "w", castling = "-", , , move = "1"] = fen.trim().split(/\s+/);
  const rows = board?.split("/") ?? [];
  if (rows.length !== 8) return null;
  const squares: Squares = [];
  for (const row of rows) {
    for (const char of row) {
      if (/[1-8]/.test(char)) {
        for (let i = 0; i < Number(char); i += 1) squares.push(null);
      } else {
        const type = char.toLowerCase() as PieceType;
        if (!PIECE_TYPES.includes(type)) return null;
        squares.push({ color: char === char.toLowerCase() ? "b" : "w", type });
      }
    }
  }
  if (squares.length !== 64) return null;
  return {
    squares,
    turn: turn === "b" ? "b" : "w",
    castling: { K: castling.includes("K"), Q: castling.includes("Q"), k: castling.includes("k"), q: castling.includes("q") },
    moveNumber: Math.max(1, Number(move) || 1),
  };
}

export const startSetup = (): Setup => fenToSetup(START_FEN) as Setup;

export const clearedSetup = (): Setup => ({
  squares: emptySquares(),
  turn: "w",
  castling: { K: false, Q: false, k: false, q: false },
  moveNumber: 1,
});

/** Puts a piece on a square. Putting the same piece on the same square again takes it off. */
export function placePiece(squares: Squares, index: number, piece: Piece): Squares {
  const next = squares.slice();
  next[index] = same(squares[index], piece) ? null : { ...piece };
  return next;
}

export function removePiece(squares: Squares, index: number): Squares {
  const next = squares.slice();
  next[index] = null;
  return next;
}

/** Moves whatever stands on one square to another, taking anything that was there. */
export function movePiece(squares: Squares, from: number, to: number): Squares {
  if (from === to || !squares[from]) return squares;
  const next = squares.slice();
  next[to] = next[from];
  next[from] = null;
  return next;
}
