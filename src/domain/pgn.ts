import { Chess, type Move } from "chess.js";
import { START_FEN } from "./fen";
import type { MoveInput } from "./game";

/**
 * A game as a tree of moves, so that variations and comments survive.
 *
 * This file only reads the *shape* of PGN text: move numbers, ( ) variations,
 * { } comments and $ symbols. Every move is passed to chess.js, which decides
 * whether it is legal and what it is called. Nothing here works out chess
 * moves itself.
 */

export type PgnNode = {
  id: string;
  parentId: string | null;
  /** Children in order. The first is the main line, the rest are variations. */
  childIds: string[];
  /** The move that leads to this node. null for the root. */
  san: string | null;
  from: string | null;
  to: string | null;
  promotion?: "q" | "r" | "b" | "n";
  /** The position after the move. */
  fen: string;
  /** Half-moves from the start of the tree. The root is 0. */
  ply: number;
  /** Comment written after the move. */
  comment: string;
  /** Comment written before the move, such as at the start of a variation. */
  commentBefore: string;
  /** Numeric annotation glyphs: 1 is "!", 2 is "?", and so on. */
  nags: number[];
};

export type LineTree = {
  startFen: string;
  rootId: string;
  nodes: Record<string, PgnNode>;
  nextId: number;
};

export type PgnGame = {
  headers: Record<string, string>;
  title: string;
  result: string;
  tree: LineTree;
};

export type Parsed<T> = ({ ok: true } & T) | { ok: false; error: string };

const ROOT_ID = "n0";

export function createTree(startFen: string = START_FEN): LineTree {
  return {
    startFen,
    rootId: ROOT_ID,
    nextId: 1,
    nodes: {
      [ROOT_ID]: {
        id: ROOT_ID,
        parentId: null,
        childIds: [],
        san: null,
        from: null,
        to: null,
        fen: startFen,
        ply: 0,
        comment: "",
        commentBefore: "",
        nags: [],
      },
    },
  };
}

export function getNode(tree: LineTree, id: string): PgnNode {
  const node = tree.nodes[id];
  if (!node) throw new Error(`No move with id ${id}`);
  return node;
}

/** The ids from the root's first move down to `id`, in order. */
export function pathTo(tree: LineTree, id: string): string[] {
  const path: string[] = [];
  let current: PgnNode | undefined = tree.nodes[id];
  while (current && current.parentId !== null) {
    path.unshift(current.id);
    current = tree.nodes[current.parentId];
  }
  return path;
}

/** Follows the main line from `id` to its end. Does not include `id`. */
export function mainlineFrom(tree: LineTree, id: string): string[] {
  const ids: string[] = [];
  let current = tree.nodes[id];
  while (current && current.childIds.length > 0) {
    ids.push(current.childIds[0]);
    current = tree.nodes[current.childIds[0]];
  }
  return ids;
}

export function sideToMove(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** "3. Nf3" or "3... Nc6": the label for the move that leads to this node. */
export function moveLabel(tree: LineTree, id: string): string {
  const node = getNode(tree, id);
  if (node.parentId === null || node.san === null) return "Start";
  const before = getNode(tree, node.parentId).fen.split(" ");
  const number = before[5] ?? "1";
  return before[1] === "b" ? `${number}... ${node.san}` : `${number}. ${node.san}`;
}

function moveFrom(fen: string, move: string | MoveInput): Move | null {
  try {
    const chess = new Chess(fen);
    return typeof move === "string"
      ? chess.move(move)
      : chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  } catch {
    return null;
  }
}

function withChild(tree: LineTree, parentId: string, move: Move): { tree: LineTree; id: string } {
  const parent = getNode(tree, parentId);
  const existing = parent.childIds
    .map((childId) => tree.nodes[childId])
    .find((child) => child.from === move.from && child.to === move.to && child.promotion === move.promotion);
  if (existing) return { tree, id: existing.id };

  const id = `n${tree.nextId}`;
  const node: PgnNode = {
    id,
    parentId,
    childIds: [],
    san: move.san,
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion as PgnNode["promotion"] } : {}),
    fen: move.after,
    ply: parent.ply + 1,
    comment: "",
    commentBefore: "",
    nags: [],
  };
  return {
    id,
    tree: {
      ...tree,
      nextId: tree.nextId + 1,
      nodes: { ...tree.nodes, [parentId]: { ...parent, childIds: [...parent.childIds, id] }, [id]: node },
    },
  };
}

/**
 * Plays a move after `parentId`. If the same move already follows it, that
 * move is reused rather than added twice. Returns null if the move is illegal.
 */
export function addMove(tree: LineTree, parentId: string, input: MoveInput | string): { tree: LineTree; id: string } | null {
  const parent = getNode(tree, parentId);
  const move = moveFrom(parent.fen, input);
  return move ? withChild(tree, parentId, move) : null;
}

/**
 * Copies a parsed line (with its comments and variations) into `tree`, as
 * moves after `parentId`. The line must start from the same position as
 * `parentId`. Moves already there are reused. Returns the new tree and the
 * end of the copied main line, so the caller can move the board there.
 */
export function graft(tree: LineTree, parentId: string, line: LineTree): { tree: LineTree; endId: string } {
  let result = tree;
  let endId = parentId;

  const copy = (sourceId: string, targetId: string, onMainline: boolean) => {
    getNode(line, sourceId).childIds.forEach((childId, index) => {
      const child = getNode(line, childId);
      const target = getNode(result, targetId);
      const same = target.childIds
        .map((id) => result.nodes[id])
        .find((node) => node.from === child.from && node.to === child.to && node.promotion === child.promotion);

      let newId: string;
      if (same) {
        newId = same.id;
        result = {
          ...result,
          nodes: {
            ...result.nodes,
            [same.id]: {
              ...same,
              comment: same.comment || child.comment,
              commentBefore: same.commentBefore || child.commentBefore,
              nags: same.nags.length > 0 ? same.nags : child.nags,
            },
          },
        };
      } else {
        newId = `n${result.nextId}`;
        result = {
          ...result,
          nextId: result.nextId + 1,
          nodes: {
            ...result.nodes,
            [target.id]: { ...target, childIds: [...target.childIds, newId] },
            [newId]: { ...child, id: newId, parentId: target.id, childIds: [], ply: target.ply + 1 },
          },
        };
      }
      const mainline = onMainline && index === 0;
      if (mainline) endId = newId;
      copy(childId, newId, mainline);
    });
  };

  copy(line.rootId, parentId, true);
  return { tree: result, endId };
}

/** Removes a move and everything after it. The root can't be removed. */
export function deleteFrom(tree: LineTree, id: string): LineTree {
  const node = getNode(tree, id);
  if (node.parentId === null) return tree;
  const doomed = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    doomed.add(next);
    stack.push(...getNode(tree, next).childIds);
  }
  const nodes: Record<string, PgnNode> = {};
  for (const [key, value] of Object.entries(tree.nodes)) if (!doomed.has(key)) nodes[key] = value;
  const parent = getNode(tree, node.parentId);
  nodes[parent.id] = { ...parent, childIds: parent.childIds.filter((childId) => childId !== id) };
  return { ...tree, nodes };
}

// ---------------------------------------------------------------- reading

type Token =
  | { type: "comment"; text: string }
  | { type: "open" }
  | { type: "close" }
  | { type: "nag"; value: number }
  | { type: "move"; san: string }
  | { type: "result"; value: string };

const SYMBOL_NAGS: Record<string, number> = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
const NAG_SYMBOLS: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };
const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

function tokenize(text: string): Parsed<{ tokens: Token[] }> {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) {
      i += 1;
    } else if (char === "{") {
      const end = text.indexOf("}", i);
      if (end === -1) return { ok: false, error: "A comment that starts with { never closes with }." };
      tokens.push({ type: "comment", text: tidy(text.slice(i + 1, end)) });
      i = end + 1;
    } else if (char === ";") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      tokens.push({ type: "comment", text: tidy(text.slice(i + 1, stop)) });
      i = stop;
    } else if (char === "%" && (i === 0 || text[i - 1] === "\n")) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
    } else if (char === "(") {
      tokens.push({ type: "open" });
      i += 1;
    } else if (char === ")") {
      tokens.push({ type: "close" });
      i += 1;
    } else if (char === "$") {
      const match = /^\$(\d+)/.exec(text.slice(i));
      if (match) {
        tokens.push({ type: "nag", value: Number(match[1]) });
        i += match[0].length;
      } else {
        i += 1;
      }
    } else {
      let end = i;
      while (end < text.length && !/[\s(){};$]/.test(text[end])) end += 1;
      let word = text.slice(i, end);
      i = end;

      if (RESULT.test(word)) {
        tokens.push({ type: "result", value: word });
        continue;
      }
      word = word.replace(/^\d+\.+/, "");
      if (word === "" || /^\d+$/.test(word) || word === "e.p.") continue;

      const suffix = /([!?]{1,2})$/.exec(word);
      if (suffix) word = word.slice(0, -suffix[1].length);
      if (word === "--" || word === "Z0") {
        return { ok: false, error: "Null moves (--) aren't supported." };
      }
      word = word.replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
      if (word !== "") tokens.push({ type: "move", san: word });
      if (suffix && SYMBOL_NAGS[suffix[1]]) tokens.push({ type: "nag", value: SYMBOL_NAGS[suffix[1]] });
    }
  }
  return { ok: true, tokens };
}

const joinComments = (a: string, b: string) => (a ? `${a} ${b}` : b);

/**
 * Reads PGN movetext (moves, comments, variations) played from `startFen`.
 * Stops with a plain-language error at the first move that isn't legal.
 */
export function parseMovetext(text: string, startFen: string = START_FEN): Parsed<{ tree: LineTree; result: string }> {
  try {
    new Chess(startFen);
  } catch {
    return { ok: false, error: "The starting position isn't a valid FEN." };
  }
  const lexed = tokenize(text);
  if (!lexed.ok) return lexed;

  let tree = createTree(startFen);
  let current = tree.rootId;
  const stack: string[] = [];
  let pendingBefore: string | null = null;
  let result = "";

  for (const token of lexed.tokens) {
    if (token.type === "comment") {
      if (token.text === "") continue;
      if (pendingBefore !== null) {
        pendingBefore = joinComments(pendingBefore, token.text);
      } else {
        const node = getNode(tree, current);
        tree = {
          ...tree,
          nodes: { ...tree.nodes, [current]: { ...node, comment: joinComments(node.comment, token.text) } },
        };
      }
    } else if (token.type === "open") {
      const node = getNode(tree, current);
      if (node.parentId === null) return { ok: false, error: "A variation in ( ) has to come after a move." };
      stack.push(current);
      current = node.parentId;
      pendingBefore = "";
    } else if (token.type === "close") {
      const back = stack.pop();
      if (back === undefined) return { ok: false, error: "There's a ) with no ( before it." };
      current = back;
      pendingBefore = null;
    } else if (token.type === "nag") {
      const node = getNode(tree, current);
      if (node.parentId !== null && !node.nags.includes(token.value)) {
        tree = { ...tree, nodes: { ...tree.nodes, [current]: { ...node, nags: [...node.nags, token.value] } } };
      }
    } else if (token.type === "result") {
      result = token.value;
      if (stack.length === 0) break;
    } else {
      const parent = getNode(tree, current);
      const move = moveFrom(parent.fen, token.san);
      if (!move) {
        const fields = parent.fen.split(" ");
        const label = fields[1] === "b" ? `${fields[5]}... ${token.san}` : `${fields[5]}. ${token.san}`;
        return { ok: false, error: `"${label}" isn't a legal move in that position.` };
      }
      const added = withChild(tree, current, move);
      tree = added.tree;
      if (pendingBefore) {
        const node = getNode(tree, added.id);
        tree = { ...tree, nodes: { ...tree.nodes, [added.id]: { ...node, commentBefore: pendingBefore } } };
      }
      pendingBefore = null;
      current = added.id;
    }
  }
  if (stack.length > 0) return { ok: false, error: "A ( was never closed with a )." };
  return { ok: true, tree, result };
}

const HEADER_LINE = /^\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;

type RawGame = { headerLines: string[]; moveLines: string[] };

function splitGames(text: string): RawGame[] {
  const games: RawGame[] = [];
  let current: RawGame = { headerLines: [], moveLines: [] };
  const flush = () => {
    if (current.headerLines.length > 0 || current.moveLines.some((line) => line.trim() !== "")) games.push(current);
    current = { headerLines: [], moveLines: [] };
  };
  for (const line of text.split("\n")) {
    if (HEADER_LINE.test(line)) {
      if (current.moveLines.some((moveLine) => moveLine.trim() !== "")) flush();
      current.headerLines.push(line);
    } else {
      current.moveLines.push(line);
    }
  }
  flush();
  return games;
}

function readHeaders(lines: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const match = HEADER_LINE.exec(line);
    if (match) headers[match[1]] = match[2].replace(/\\(["\\])/g, "$1");
  }
  return headers;
}

function gameTitle(headers: Record<string, string>, index: number): string {
  const { White, Black, Event } = headers;
  const known = (name?: string) => name && name !== "?" && name !== "";
  if (known(White) && known(Black)) return `${White} v ${Black}`;
  if (known(Event)) return Event;
  return `Game ${index + 1}`;
}

/** Reads one or more games from PGN text. Variations and comments are kept. */
export function parsePgn(input: string): Parsed<{ games: PgnGame[] }> {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (text.trim() === "") return { ok: false, error: "Paste a PGN to read." };

  const raw = splitGames(text);
  const games: PgnGame[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const headers = readHeaders(raw[index].headerLines);
    const where = raw.length > 1 ? `Game ${index + 1}: ` : "";
    const startFen = headers.FEN?.trim() || START_FEN;
    if (headers.FEN) {
      try {
        new Chess(startFen);
      } catch {
        return { ok: false, error: `${where}The FEN in the PGN header isn't valid.` };
      }
    }
    const parsed = parseMovetext(raw[index].moveLines.join("\n"), startFen);
    if (!parsed.ok) return { ok: false, error: `${where}${parsed.error}` };
    games.push({
      headers,
      title: gameTitle(headers, index),
      result: headers.Result && headers.Result !== "*" ? headers.Result : parsed.result,
      tree: parsed.tree,
    });
  }
  if (games.every((game) => game.tree.nextId === 1)) {
    return { ok: false, error: "I couldn't find any moves in that PGN." };
  }
  return { ok: true, games };
}

// ---------------------------------------------------------------- writing

export type SerializeOptions = {
  /** Stop the main line after this many half-moves. Variations on those moves are kept whole. */
  maxPlies?: number;
};

const cleanComment = (text: string) => tidy(text.replace(/[{}]/g, ""));

function moveText(tree: LineTree, node: PgnNode, numbered: boolean): string {
  const parent = getNode(tree, node.parentId as string);
  const [, side, , , , full] = parent.fen.split(" ");
  const symbols = node.nags.filter((nag) => NAG_SYMBOLS[nag]);
  const others = node.nags.filter((nag) => !NAG_SYMBOLS[nag]);
  const san = `${node.san}${symbols.map((nag) => NAG_SYMBOLS[nag]).join("")}`;
  const prefix = side === "w" ? `${full}. ` : numbered ? `${full}... ` : "";
  return `${prefix}${san}${others.map((nag) => ` $${nag}`).join("")}`;
}

function writeSequence(tree: LineTree, leadId: string, altIds: string[], out: string[], budget: number): void {
  let lead: string | undefined = leadId;
  let alts = altIds;
  let numbered = true;
  let remaining = budget;
  while (lead !== undefined) {
    const node = getNode(tree, lead);
    if (node.commentBefore) {
      out.push(`{${cleanComment(node.commentBefore)}}`);
      numbered = true;
    }
    out.push(moveText(tree, node, numbered));
    numbered = false;
    if (node.comment) {
      out.push(`{${cleanComment(node.comment)}}`);
      numbered = true;
    }
    for (const alt of alts) {
      out.push("(");
      writeSequence(tree, alt, [], out, Infinity);
      out.push(")");
      numbered = true;
    }
    remaining -= 1;
    if (remaining <= 0) break;
    lead = node.childIds[0];
    alts = node.childIds.slice(1);
  }
}

/**
 * PGN movetext for everything that follows `fromId`: the main line, its
 * comments, and all variations. The first move is numbered, and a variation
 * that begins with Black's move is written like "5... Nc6".
 */
export function serializeFrom(tree: LineTree, fromId: string, options: SerializeOptions = {}): string {
  const kids = getNode(tree, fromId).childIds;
  if (kids.length === 0) return "";
  const out: string[] = [];
  writeSequence(tree, kids[0], kids.slice(1), out, options.maxPlies ?? Infinity);
  // Variations read as (5. d4 d5), without a space inside the brackets.
  return out
    .join(" ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")");
}
