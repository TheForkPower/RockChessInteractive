import { describe, expect, it } from "vitest";
import {
  answerText,
  buildDeckCards,
  checkContinuation,
  draftFromPosition,
  parseAlternatives,
  parseAnswer,
  parseTags,
} from "./cards";
import { START_FEN } from "./fen";
import { getNode, mainlineFrom, parseMovetext, type LineTree } from "./pgn";

function tree(text: string, fen = START_FEN): LineTree {
  const parsed = parseMovetext(text, fen);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.tree;
}

const LINE = "1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6 {Developing.} 3. Bb5 a6";

describe("draftFromPosition", () => {
  it("makes a one-move card from the position after 1. e4 e5", () => {
    const t = tree(LINE);
    const e5 = mainlineFrom(t, t.rootId)[1];
    const result = draftFromPosition(t, e5, { kind: "move" });
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    expect(draft.fen).toBe(getNode(t, e5).fen);
    expect(draft.side).toBe("w");
    expect(draft.prompt).toBe("White to move.");
    expect(draft.answer.map((m) => m.san)).toEqual(["Nf3"]);
    expect(draft.sourcePly).toBe(2);
  });

  it("keeps the variations and comments on the back", () => {
    const t = tree(LINE);
    const e5 = mainlineFrom(t, t.rootId)[1];
    const result = draftFromPosition(t, e5, { kind: "move" });
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.continuation).toBe("2. Nf3 (2. Bc4 Nf6) 2... Nc6 {Developing.} 3. Bb5 a6");
  });

  it("makes a line card with a chosen number of moves", () => {
    const t = tree(LINE);
    const e4 = mainlineFrom(t, t.rootId)[0];
    const result = draftFromPosition(t, e4, { kind: "line", plies: 3 });
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.side).toBe("b");
    expect(result.draft.answer.map((m) => m.san)).toEqual(["e5", "Nf3", "Nc6"]);
  });

  it("explains when nothing follows", () => {
    const t = tree("1. e4");
    const last = mainlineFrom(t, t.rootId)[0];
    expect(draftFromPosition(t, last, { kind: "move" })).toMatchObject({ ok: false });
  });
});

describe("buildDeckCards", () => {
  it("makes a card for each of White's moves", () => {
    const t = tree(LINE);
    const result = buildDeckCards(t, { side: "w", shape: "moves", context: "rest" });
    if (!result.ok) throw new Error(result.error);
    expect(result.drafts.map((d) => d.answer[0].san)).toEqual(["e4", "Nf3", "Bb5"]);
    expect(result.drafts.every((d) => d.kind === "move" && d.side === "w")).toBe(true);
    expect(result.drafts[0].fen).toBe(START_FEN);
  });

  it("makes a card for each of Black's moves", () => {
    const t = tree(LINE);
    const result = buildDeckCards(t, { side: "b", shape: "moves", context: "rest" });
    if (!result.ok) throw new Error(result.error);
    expect(result.drafts.map((d) => d.answer[0].san)).toEqual(["e5", "Nc6", "a6"]);
  });

  it("carries variations onto the cards they belong to", () => {
    const t = tree(LINE);
    const result = buildDeckCards(t, { side: "w", shape: "moves", context: "rest" });
    if (!result.ok) throw new Error(result.error);
    expect(result.drafts[1].continuation).toBe("2. Nf3 (2. Bc4 Nf6) 2... Nc6 {Developing.} 3. Bb5 a6");
    expect(result.drafts[2].continuation).toBe("3. Bb5 a6");
  });

  it("can show just the move and the reply, keeping a variation on those moves", () => {
    const t = tree(LINE);
    const result = buildDeckCards(t, { side: "w", shape: "moves", context: "reply" });
    if (!result.ok) throw new Error(result.error);
    expect(result.drafts[1].continuation).toBe("2. Nf3 (2. Bc4 Nf6) 2... Nc6 {Developing.}");
  });

  it("makes one card for the whole line, starting with White's move played for the opponent", () => {
    const t = tree(LINE);
    const result = buildDeckCards(t, { side: "b", shape: "line", context: "rest" });
    if (!result.ok) throw new Error(result.error);
    expect(result.drafts).toHaveLength(1);
    const [draft] = result.drafts;
    expect(draft.kind).toBe("line");
    expect(draft.side).toBe("b");
    expect(draft.fen).toBe(START_FEN);
    expect(draft.answer.map((m) => m.san)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  });

  it("starts from a chosen position", () => {
    const t = tree(LINE);
    const e5 = mainlineFrom(t, t.rootId)[1];
    const result = buildDeckCards(t, { side: "w", shape: "moves", context: "rest", fromId: e5 });
    if (!result.ok) throw new Error(result.error);
    expect(result.drafts.map((d) => d.answer[0].san)).toEqual(["Nf3", "Bb5"]);
  });

  it("says when there are no moves for that side", () => {
    const t = tree("1. e4");
    expect(buildDeckCards(t, { side: "b", shape: "moves", context: "rest" })).toEqual({
      ok: false,
      error: "There are no moves for Black in this line.",
    });
    expect(buildDeckCards(t, { side: "b", shape: "line", context: "rest" })).toMatchObject({ ok: false });
    expect(buildDeckCards(tree(""), { side: "w", shape: "line", context: "rest" })).toMatchObject({ ok: false });
  });
});

describe("parseAnswer", () => {
  it("reads one move for a move card", () => {
    const result = parseAnswer(START_FEN, "e4", "move");
    expect(result).toMatchObject({ ok: true, moves: [{ from: "e2", to: "e4", san: "e4" }] });
  });

  it("reads a line, with or without move numbers", () => {
    const a = parseAnswer(START_FEN, "1. e4 e5 2. Nf3", "line");
    const b = parseAnswer(START_FEN, "e4 e5 Nf3", "line");
    expect(a.ok && a.moves.map((m) => m.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(b).toEqual(a);
  });

  it("rejects an empty answer, illegal moves, variations and a long answer on a move card", () => {
    expect(parseAnswer(START_FEN, " ", "move")).toEqual({ ok: false, error: "Enter the answer." });
    expect(parseAnswer(START_FEN, "e5", "move")).toMatchObject({ ok: false, error: expect.stringContaining("legal") });
    expect(parseAnswer(START_FEN, "e4 (d4)", "line")).toMatchObject({ ok: false, error: expect.stringContaining("variations") });
    expect(parseAnswer(START_FEN, "e4 e5", "move")).toMatchObject({ ok: false, error: expect.stringContaining("exactly one") });
  });
});

describe("parseAlternatives", () => {
  const answer = (() => {
    const r = parseAnswer(START_FEN, "e4", "move");
    return r.ok ? r.moves : [];
  })();

  it("reads other accepted moves and drops the answer itself and repeats", () => {
    const r = parseAlternatives(START_FEN, "d4, Nf3, e4, d4", answer);
    expect(r.ok && r.moves.map((m) => m.san)).toEqual(["d4", "Nf3"]);
  });

  it("allows none", () => {
    expect(parseAlternatives(START_FEN, "", answer)).toEqual({ ok: true, moves: [] });
  });

  it("names a move that isn't legal", () => {
    expect(parseAlternatives(START_FEN, "d4, Qh5x", answer)).toEqual({
      ok: false,
      error: '"Qh5x" isn\'t a legal move in this position.',
    });
  });
});

describe("other helpers", () => {
  it("writes an answer back as text", () => {
    const r = parseAnswer(START_FEN, "e4 e5 Nf3", "line");
    expect(r.ok && answerText(START_FEN, r.moves)).toBe("1. e4 e5 2. Nf3");
  });

  it("checks a continuation, allowing an empty one", () => {
    expect(checkContinuation(START_FEN, "").ok).toBe(true);
    expect(checkContinuation(START_FEN, "1. e4 (1. d4) e5").ok).toBe(true);
    expect(checkContinuation(START_FEN, "1. e5")).toMatchObject({ ok: false });
  });

  it("splits tags", () => {
    expect(parseTags(" Sicilian, najdorf ,, sicilian ")).toEqual(["Sicilian", "najdorf"]);
    expect(parseTags("")).toEqual([]);
  });
});
