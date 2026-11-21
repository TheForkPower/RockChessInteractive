import { describe, expect, it } from "vitest";
import { START_FEN } from "./fen";
import {
  addMove,
  createTree,
  deleteFrom,
  getNode,
  graft,
  mainlineFrom,
  moveLabel,
  parseMovetext,
  parsePgn,
  pathTo,
  serializeFrom,
  type LineTree,
} from "./pgn";

function tree(text: string, fen = START_FEN): LineTree {
  const parsed = parseMovetext(text, fen);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.tree;
}

const sans = (t: LineTree, ids: string[]) => ids.map((id) => getNode(t, id).san);

describe("parseMovetext", () => {
  it("reads a plain line", () => {
    const t = tree("1. e4 e5 2. Nf3 Nc6");
    expect(sans(t, mainlineFrom(t, t.rootId))).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("accepts moves without spaces after the number, and castling written with zeros", () => {
    const t = tree("1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.0-0");
    expect(sans(t, mainlineFrom(t, t.rootId))).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O"]);
  });

  it("keeps a variation as a sibling of the move it replaces", () => {
    const t = tree("1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6");
    const e5 = mainlineFrom(t, t.rootId)[1];
    const children = getNode(t, e5).childIds;
    expect(sans(t, children)).toEqual(["Nf3", "Bc4"]);
    expect(sans(t, mainlineFrom(t, e5))).toEqual(["Nf3", "Nc6"]);
    expect(sans(t, getNode(t, children[1]).childIds)).toEqual(["Nf6"]);
  });

  it("keeps nested variations", () => {
    const t = tree("1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3");
    const e4 = getNode(t, t.rootId).childIds[0];
    const [e5, c5] = getNode(t, e4).childIds;
    expect(getNode(t, e5).san).toBe("e5");
    expect(getNode(t, c5).san).toBe("c5");
    const nf3 = getNode(t, c5).childIds[0];
    expect(sans(t, getNode(t, nf3).childIds)).toEqual(["d6"]);
    expect(sans(t, getNode(t, c5).childIds)).toEqual(["Nf3", "c3"]);
  });

  it("keeps comments, including one at the start of a variation", () => {
    const t = tree("1. e4 {The king's pawn.} e5 (1... c5 {The Sicilian.} 2. Nf3)");
    const e4 = getNode(t, t.rootId).childIds[0];
    expect(getNode(t, e4).comment).toBe("The king's pawn.");
    const c5 = getNode(t, e4).childIds[1];
    expect(getNode(t, c5).comment).toBe("The Sicilian.");

    const u = tree("1. e4 e5 ({Black can also try this.} 1... c5)");
    const alt = getNode(u, getNode(u, u.rootId).childIds[0]).childIds[1];
    expect(getNode(u, alt).commentBefore).toBe("Black can also try this.");
  });

  it("reads ; comments and symbols such as ! and $1", () => {
    const t = tree("1. e4! e5 ; solid\n2. Nf3 $2 Nc6?!");
    const ids = mainlineFrom(t, t.rootId);
    expect(getNode(t, ids[0]).nags).toEqual([1]);
    expect(getNode(t, ids[1]).comment).toBe("solid");
    expect(getNode(t, ids[2]).nags).toEqual([2]);
    expect(getNode(t, ids[3]).nags).toEqual([6]);
  });

  it("stops at the result", () => {
    const t = tree("1. e4 e5 1-0");
    expect(mainlineFrom(t, t.rootId)).toHaveLength(2);
  });

  it("names the move that isn't legal", () => {
    const result = parseMovetext("1. e4 e5 2. Nf3 Nf3", START_FEN);
    expect(result).toEqual({ ok: false, error: '"2... Nf3" isn\'t a legal move in that position.' });
  });

  it("explains unbalanced brackets and comments", () => {
    expect(parseMovetext("1. e4 (1. d4", START_FEN)).toMatchObject({ ok: false, error: expect.stringContaining("never closed") });
    expect(parseMovetext("1. e4 e5)", START_FEN)).toMatchObject({ ok: false, error: expect.stringContaining("no (") });
    expect(parseMovetext("1. e4 {oops", START_FEN)).toMatchObject({ ok: false, error: expect.stringContaining("never closes") });
    expect(parseMovetext("(1. e4)", START_FEN)).toMatchObject({ ok: false, error: expect.stringContaining("after a move") });
  });

  it("plays from a custom starting position", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    const t = tree("3. Bb5 a6", fen);
    expect(sans(t, mainlineFrom(t, t.rootId))).toEqual(["Bb5", "a6"]);
    expect(moveLabel(t, mainlineFrom(t, t.rootId)[1])).toBe("3... a6");
  });

  it("rejects a bad starting FEN", () => {
    expect(parseMovetext("1. e4", "nonsense")).toMatchObject({ ok: false });
  });
});

describe("serializeFrom", () => {
  const text = "1. e4 {King's pawn.} e5 2. Nf3 (2. Bc4 Nf6 (2... Bc5)) 2... Nc6 3. Bb5";

  it("writes the line back with its comments and variations", () => {
    const t = tree(text);
    expect(serializeFrom(t, t.rootId)).toBe(
      "1. e4 {King's pawn.} 1... e5 2. Nf3 (2. Bc4 Nf6 (2... Bc5)) 2... Nc6 3. Bb5",
    );
  });

  it("reads back to the same tree it wrote", () => {
    const t = tree(text);
    const again = tree(serializeFrom(t, t.rootId));
    expect(serializeFrom(again, again.rootId)).toBe(serializeFrom(t, t.rootId));
  });

  it("numbers a Black move that starts the line, and one after a comment", () => {
    const t = tree("1. e4 e5 2. Nf3");
    const e4 = getNode(t, t.rootId).childIds[0];
    expect(serializeFrom(t, e4)).toBe("1... e5 2. Nf3");
  });

  it("limits the main line but keeps variations on the moves it includes", () => {
    const t = tree("1. e4 e5 (1... c5) 2. Nf3 Nc6 3. Bb5");
    const e4 = getNode(t, t.rootId).childIds[0];
    expect(serializeFrom(t, e4, { maxPlies: 2 })).toBe("1... e5 (1... c5) 2. Nf3");
    expect(serializeFrom(t, e4, { maxPlies: 1 })).toBe("1... e5 (1... c5)");
  });

  it("returns an empty string at the end of a line", () => {
    const t = tree("1. e4");
    expect(serializeFrom(t, mainlineFrom(t, t.rootId)[0])).toBe("");
  });

  it("writes symbols back", () => {
    const t = tree("1. e4! e5?! 2. Nf3 $14");
    expect(serializeFrom(t, t.rootId)).toBe("1. e4! e5?! 2. Nf3 $14");
  });
});

describe("parsePgn", () => {
  const game = `[Event "Casual"]
[White "Morphy"]
[Black "Duke of Brunswick"]
[Result "1-0"]

1. e4 e5 2. Nf3 (2. f4 {the King's Gambit} exf4) 2... d6 1-0
`;

  it("reads headers and keeps variations", () => {
    const parsed = parsePgn(game);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.games).toHaveLength(1);
    expect(parsed.games[0].title).toBe("Morphy v Duke of Brunswick");
    expect(parsed.games[0].result).toBe("1-0");
    const t = parsed.games[0].tree;
    expect(serializeFrom(t, t.rootId)).toBe("1. e4 e5 2. Nf3 (2. f4 {the King's Gambit} 2... exf4) 2... d6");
  });

  it("reads several games", () => {
    const parsed = parsePgn(`${game}\n[Event "Second"]\n\n1. d4 d5 *\n`);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.games.map((g) => g.title)).toEqual(["Morphy v Duke of Brunswick", "Second"]);
  });

  it("starts from the FEN header", () => {
    const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const parsed = parsePgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4 Kd7`);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.games[0].tree.startFen).toBe(fen);
    expect(mainlineFrom(parsed.games[0].tree, "n0")).toHaveLength(2);
  });

  it("accepts movetext with no headers, and Windows line endings", () => {
    const parsed = parsePgn("1. e4 e5\r\n2. Nf3 Nc6\r\n");
    expect(parsed.ok).toBe(true);
  });

  it("says which game has a problem", () => {
    const parsed = parsePgn(`${game}\n[Event "Bad"]\n\n1. e4 e4`);
    expect(parsed).toEqual({ ok: false, error: 'Game 2: "1... e4" isn\'t a legal move in that position.' });
  });

  it("rejects empty text, text with no moves, and a bad FEN header", () => {
    expect(parsePgn("   ")).toEqual({ ok: false, error: "Paste a PGN to read." });
    expect(parsePgn('[Event "x"]\n\n*')).toEqual({ ok: false, error: "I couldn't find any moves in that PGN." });
    expect(parsePgn('[FEN "bad"]\n\n1. e4')).toMatchObject({ ok: false, error: expect.stringContaining("FEN") });
  });
});

describe("tree editing", () => {
  it("adds moves, and reuses a move that is already there", () => {
    let t = createTree();
    const first = addMove(t, t.rootId, { from: "e2", to: "e4" });
    if (!first) throw new Error("e4 should be legal");
    t = first.tree;
    const again = addMove(t, t.rootId, "e4");
    expect(again?.id).toBe(first.id);
    expect(getNode(t, t.rootId).childIds).toHaveLength(1);
  });

  it("refuses an illegal move", () => {
    const t = createTree();
    expect(addMove(t, t.rootId, { from: "e2", to: "e5" })).toBeNull();
    expect(addMove(t, t.rootId, "Nf6")).toBeNull();
  });

  it("adds a different move as a variation", () => {
    let t = createTree();
    t = (addMove(t, t.rootId, "e4") as { tree: LineTree }).tree;
    t = (addMove(t, t.rootId, "d4") as { tree: LineTree }).tree;
    expect(sans(t, getNode(t, t.rootId).childIds)).toEqual(["e4", "d4"]);
  });

  it("records a promotion", () => {
    const fen = "8/P6k/8/8/8/8/8/K7 w - - 0 1";
    const t = createTree(fen);
    const added = addMove(t, t.rootId, { from: "a7", to: "a8", promotion: "q" });
    expect(added && getNode(added.tree, added.id).san).toBe("a8=Q");
  });

  it("deletes a move and everything after it", () => {
    const t = tree("1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6");
    const e5 = mainlineFrom(t, t.rootId)[1];
    const nf3 = getNode(t, e5).childIds[0];
    const cut = deleteFrom(t, nf3);
    expect(sans(cut, getNode(cut, e5).childIds)).toEqual(["Bc4"]);
    expect(Object.keys(cut.nodes)).toHaveLength(Object.keys(t.nodes).length - 2);
    expect(deleteFrom(t, t.rootId)).toBe(t);
  });

  it("finds the path to a move", () => {
    const t = tree("1. e4 e5 2. Nf3");
    const last = mainlineFrom(t, t.rootId)[2];
    expect(sans(t, pathTo(t, last))).toEqual(["e4", "e5", "Nf3"]);
    expect(moveLabel(t, last)).toBe("2. Nf3");
  });
});

describe("graft", () => {
  it("adds a typed line, with its variations and comments, after a position", () => {
    const base = tree("1. e4");
    const e4 = mainlineFrom(base, base.rootId)[0];
    const typed = tree("1... e5 {Solid.} 2. Nf3 (2. Bc4) 2... Nc6", getNode(base, e4).fen);
    const { tree: joined, endId } = graft(base, e4, typed);
    expect(serializeFrom(joined, joined.rootId)).toBe("1. e4 e5 {Solid.} 2. Nf3 (2. Bc4) 2... Nc6");
    expect(getNode(joined, endId).san).toBe("Nc6");
    expect(getNode(joined, endId).ply).toBe(4);
  });

  it("reuses moves that are already there and adds new ones as variations", () => {
    const base = tree("1. e4 e5 2. Nf3");
    const e4 = mainlineFrom(base, base.rootId)[0];
    const typed = tree("1... e5 2. Bc4", getNode(base, e4).fen);
    const { tree: joined, endId } = graft(base, e4, typed);
    expect(serializeFrom(joined, joined.rootId)).toBe("1. e4 e5 2. Nf3 (2. Bc4)");
    expect(getNode(joined, endId).san).toBe("Bc4");
  });

  it("does nothing for an empty line", () => {
    const base = tree("1. e4");
    const { tree: same, endId } = graft(base, base.rootId, createTree());
    expect(same).toBe(base);
    expect(endId).toBe(base.rootId);
  });
});
