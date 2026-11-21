import { mainlineFrom, type LineTree, type PgnNode } from "./pgn";

/** A stretch of an explanation: plain words, or a move that can be clicked to show its position. */
export type Piece = { kind: "text"; text: string } | { kind: "move"; text: string; nodeId: string };

const NAG_SYMBOLS: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };

/**
 * People write explanations with PGN habits: { } around comments and $1 for a
 * "!". Braces are dropped and the glyphs are written out, so the text reads
 * the way it would on a page.
 */
export function tidyPgnSyntax(text: string): string {
  return text
    .replace(/\$(\d+)/g, (_, n: string) => NAG_SYMBOLS[Number(n)] ?? "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

const SAN = "(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)";
const MOVE = new RegExp(`(?<![A-Za-z0-9])(?:(\\d+)(\\.{1,3})\\s*)?(${SAN})([+#]?)([!?]{0,2})(?![A-Za-z0-9])`, "g");

const plain = (san: string) => san.replace(/[+#!?]+$/, "");

function describe(tree: LineTree, node: PgnNode): { number: number; colour: "w" | "b" } {
  const before = tree.nodes[node.parentId as string].fen.split(" ");
  return { number: Number(before[5] ?? "1"), colour: before[1] === "b" ? "b" : "w" };
}

/** A move's place in the tree: found by its number, colour and name. The main line is tried first. */
function find(tree: LineTree, mainline: Set<string>, number: number, colour: "w" | "b", san: string): PgnNode | null {
  const wanted = plain(san);
  let other: PgnNode | null = null;
  for (const node of Object.values(tree.nodes)) {
    if (node.san === null || plain(node.san) !== wanted) continue;
    const at = describe(tree, node);
    if (at.number !== number || at.colour !== colour) continue;
    if (mainline.has(node.id)) return node;
    other = other ?? node;
  }
  return other;
}

/**
 * Finds moves written in an explanation, such as "18. Bd6!" or "18... Bxg1 19. e5",
 * and ties each one to the same move in the card's continuation so it can be clicked.
 *
 * A move counts only when a move number starts it, or it follows another move
 * that was found. That keeps a square named in a sentence ("the bishop on g5")
 * from being mistaken for a pawn move. A move that isn't in the continuation
 * stays as plain text.
 */
export function linkMoves(rawText: string, tree: LineTree | null): Piece[] {
  const text = tidyPgnSyntax(rawText);
  if (!tree) return [{ kind: "text", text }];

  const mainline = new Set(mainlineFrom(tree, tree.rootId));
  const pieces: Piece[] = [];
  let cursor = 0;
  let previous: { node: PgnNode; end: number } | null = null;

  for (const match of text.matchAll(MOVE)) {
    const [whole, numberText, dots, san, check] = match;
    const start = match.index ?? 0;
    const end = start + whole.length;
    const continues = previous !== null && text.slice(previous.end, start).trim() === "";

    let node: PgnNode | null = null;
    if (numberText) {
      node = find(tree, mainline, Number(numberText), dots.length === 1 ? "w" : "b", san + check);
    } else if (continues && previous) {
      const after: PgnNode = previous.node;
      const here: PgnNode | undefined = after.childIds
        .map((id: string) => tree.nodes[id])
        .find((child: PgnNode) => child.san !== null && plain(child.san) === plain(san));
      node = here ?? null;
      if (!node) {
        const was = describe(tree, after);
        const next = was.colour === "w" ? { number: was.number, colour: "b" as const } : { number: was.number + 1, colour: "w" as const };
        node = find(tree, mainline, next.number, next.colour, san);
      }
    }

    if (!node) {
      previous = null;
      continue;
    }
    if (start > cursor) pieces.push({ kind: "text", text: text.slice(cursor, start) });
    pieces.push({ kind: "move", text: `${whole}`.replace(/\s+$/, ""), nodeId: node.id });
    cursor = end;
    previous = { node, end };
  }
  if (cursor < text.length) pieces.push({ kind: "text", text: text.slice(cursor) });
  return pieces;
}

/** The ids of the moves of a card's answer, if the continuation starts with them. Otherwise null. */
export function answerNodeIds(tree: LineTree | null, answer: { from: string; to: string }[]): string[] | null {
  if (!tree || answer.length === 0) return null;
  const ids = mainlineFrom(tree, tree.rootId).slice(0, answer.length);
  if (ids.length < answer.length) return null;
  const same = ids.every((id, index) => tree.nodes[id].from === answer[index].from && tree.nodes[id].to === answer[index].to);
  return same ? ids : null;
}
