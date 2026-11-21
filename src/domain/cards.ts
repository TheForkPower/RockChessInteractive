import {
  addMove,
  createTree,
  getNode,
  mainlineFrom,
  parseMovetext,
  serializeFrom,
  sideToMove,
  type LineTree,
  type Parsed,
  type PgnNode,
} from "./pgn";

/**
 * What a flashcard is. Two shapes share one model:
 *
 *  - "move": find one move from a position.
 *  - "line": recall a run of moves, played one at a time.
 *
 * `side` is the colour the learner plays. If it isn't that side's turn at the
 * start of a "line" card, the first move belongs to the opponent and is played
 * for them.
 */
export type CardMove = {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
  san: string;
};

export type CardKind = "move" | "line";
export type CardCategory = "opening" | "tactic" | "endgame" | "strategy" | "defence" | "game";

export const CATEGORIES: { value: CardCategory; label: string }[] = [
  { value: "opening", label: "Opening" },
  { value: "tactic", label: "Tactic" },
  { value: "endgame", label: "Endgame" },
  { value: "strategy", label: "Strategic position" },
  { value: "defence", label: "Defence" },
  { value: "game", label: "Personal game" },
];

export type Card = {
  id: string;
  deckId: string;
  kind: CardKind;
  category: CardCategory;
  /** The position on the front of the card. */
  fen: string;
  side: "w" | "b";
  prompt: string;
  hint: string;
  /** The moves expected, starting from `fen`. One move for a "move" card. */
  answer: CardMove[];
  /** Other first moves that also count as correct on a "move" card. */
  alternatives: CardMove[];
  /** Plain-text explanation shown on the back. */
  explanation: string;
  /** PGN movetext from `fen`, with its comments and variations, shown on the back. */
  continuation: string;
  notes: string;
  tags: string[];
  sourceId?: string;
  /** Half-moves into the source game where this card's position sits. */
  sourcePly?: number;
  createdAt: number;
  updatedAt: number;
};

export type CardDraft = Omit<Card, "id" | "deckId" | "createdAt" | "updatedAt">;

/** The editable part of a saved card, without its id, deck and dates. */
export function cardToDraft(card: Card): CardDraft {
  return {
    kind: card.kind,
    category: card.category,
    fen: card.fen,
    side: card.side,
    prompt: card.prompt,
    hint: card.hint,
    answer: card.answer,
    alternatives: card.alternatives,
    explanation: card.explanation,
    continuation: card.continuation,
    notes: card.notes,
    tags: card.tags,
    ...(card.sourceId ? { sourceId: card.sourceId } : {}),
    ...(card.sourcePly !== undefined ? { sourcePly: card.sourcePly } : {}),
  };
}

export const sideName = (side: "w" | "b") => (side === "w" ? "White" : "Black");

export const defaultPrompt = (side: "w" | "b") => `${sideName(side)} to move.`;

export function nodeMove(node: PgnNode): CardMove {
  return {
    from: node.from as string,
    to: node.to as string,
    ...(node.promotion ? { promotion: node.promotion } : {}),
    san: node.san as string,
  };
}

/** The main line after `positionId` as card moves, limited to `plies` if given. */
function lineMoves(tree: LineTree, positionId: string, plies?: number): CardMove[] {
  const ids = mainlineFrom(tree, positionId);
  return (plies === undefined ? ids : ids.slice(0, plies)).map((id) => nodeMove(getNode(tree, id)));
}

/**
 * A card that starts at one position in a line. The answer is whatever follows
 * in the main line, and the back shows the rest of the line with its
 * comments and variations.
 */
export function draftFromPosition(
  tree: LineTree,
  positionId: string,
  options: { kind: CardKind; plies?: number; category?: CardCategory },
): Parsed<{ draft: CardDraft }> {
  const position = getNode(tree, positionId);
  const answer = lineMoves(tree, positionId, options.kind === "move" ? 1 : options.plies);
  if (answer.length === 0) {
    return { ok: false, error: "There's no move after this position to use as the answer." };
  }
  const side = sideToMove(position.fen);
  return {
    ok: true,
    draft: {
      kind: options.kind,
      category: options.category ?? "opening",
      fen: position.fen,
      side,
      prompt: defaultPrompt(side),
      hint: "",
      answer,
      alternatives: [],
      explanation: "",
      continuation: serializeFrom(tree, positionId),
      notes: "",
      tags: [],
      sourcePly: position.ply,
    },
  };
}

export type DeckPlan = {
  /** The side you are learning. */
  side: "w" | "b";
  /** One card for each of your moves, or a single card for the whole line. */
  shape: "moves" | "line";
  /** What the back shows: the rest of the line, or just your move and the reply. */
  context: "rest" | "reply";
  /** Where to start. Defaults to the start of the line. */
  fromId?: string;
  category?: CardCategory;
};

/**
 * Cards for a whole line. Only the main line gets cards; variations are not
 * dropped but carried on the back of each card, where the learner can follow
 * them.
 */
export function buildDeckCards(tree: LineTree, plan: DeckPlan): Parsed<{ drafts: CardDraft[] }> {
  const fromId = plan.fromId ?? tree.rootId;
  const start = getNode(tree, fromId);
  const category = plan.category ?? "opening";
  const who = sideName(plan.side);

  if (plan.shape === "line") {
    const answer = lineMoves(tree, fromId);
    const playerMoves = mainlineFrom(tree, fromId).filter(
      (id) => sideToMove(getNode(tree, getNode(tree, id).parentId as string).fen) === plan.side,
    );
    if (answer.length === 0 || playerMoves.length === 0) {
      return { ok: false, error: `There are no moves for ${who} in this line.` };
    }
    return {
      ok: true,
      drafts: [
        {
          kind: "line",
          category,
          fen: start.fen,
          side: plan.side,
          prompt: defaultPrompt(plan.side),
          hint: "",
          answer,
          alternatives: [],
          explanation: "",
          continuation: serializeFrom(tree, fromId),
          notes: "",
          tags: [],
          sourcePly: start.ply,
        },
      ],
    };
  }

  const drafts: CardDraft[] = [];
  for (const id of [fromId, ...mainlineFrom(tree, fromId)]) {
    const position = getNode(tree, id);
    if (position.childIds.length === 0 || sideToMove(position.fen) !== plan.side) continue;
    drafts.push({
      kind: "move",
      category,
      fen: position.fen,
      side: plan.side,
      prompt: defaultPrompt(plan.side),
      hint: "",
      answer: [nodeMove(getNode(tree, position.childIds[0]))],
      alternatives: [],
      explanation: "",
      continuation: serializeFrom(tree, id, plan.context === "reply" ? { maxPlies: 2 } : {}),
      notes: "",
      tags: [],
      sourcePly: position.ply,
    });
  }
  if (drafts.length === 0) return { ok: false, error: `There are no moves for ${who} in this line.` };
  return { ok: true, drafts };
}

// ------------------------------------------------------------ editor checks

/** Reads the answer a person typed, checking each move against the position. */
export function parseAnswer(fen: string, text: string, kind: CardKind): Parsed<{ moves: CardMove[] }> {
  if (text.trim() === "") return { ok: false, error: "Enter the answer." };
  const parsed = parseMovetext(text, fen);
  if (!parsed.ok) return parsed;
  const { tree } = parsed;
  if (Object.values(tree.nodes).some((node) => node.childIds.length > 1)) {
    return { ok: false, error: "The answer is one line of moves. Put variations in the continuation." };
  }
  const moves = lineMoves(tree, tree.rootId);
  if (moves.length === 0) return { ok: false, error: "Enter the answer." };
  if (kind === "move" && moves.length !== 1) {
    return { ok: false, error: "A one-move card needs exactly one move. Switch to a line card for more." };
  }
  return { ok: true, moves };
}

/** Reads the extra accepted first moves, such as "Nf3, d4". */
export function parseAlternatives(fen: string, text: string, answer: CardMove[]): Parsed<{ moves: CardMove[] }> {
  const words = text.split(/[,;\s]+/).filter((word) => word !== "");
  const moves: CardMove[] = [];
  const base = createTree(fen);
  for (const word of words) {
    const added = addMove(base, base.rootId, word);
    if (!added) return { ok: false, error: `"${word}" isn't a legal move in this position.` };
    const move = nodeMove(getNode(added.tree, added.id));
    const same = (other: CardMove) => other.from === move.from && other.to === move.to && other.promotion === move.promotion;
    if (!moves.some(same) && !(answer[0] && same(answer[0]))) moves.push(move);
  }
  return { ok: true, moves };
}

/** Checks the continuation text. Empty is fine. */
export function checkContinuation(fen: string, text: string): Parsed<{ tree: LineTree }> {
  const parsed = parseMovetext(text, fen);
  return parsed.ok ? { ok: true, tree: parsed.tree } : parsed;
}

/** The answer written as movetext, for showing in a text box. */
export function answerText(fen: string, answer: CardMove[]): string {
  const base = createTree(fen);
  let tree = base;
  let at = base.rootId;
  for (const move of answer) {
    const added = addMove(tree, at, { from: move.from, to: move.to, promotion: move.promotion });
    if (!added) break;
    tree = added.tree;
    at = added.id;
  }
  return serializeFrom(tree, tree.rootId);
}

/** "e4", "Nf3, d4": the alternatives as a short list. */
export const alternativesText = (moves: CardMove[]) => moves.map((move) => move.san).join(", ");

/** Splits "a, b ,c" into tags, dropping blanks and repeats. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag !== "" && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}
