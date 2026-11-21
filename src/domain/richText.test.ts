import { describe, expect, it } from "vitest";
import { buildTutorialCards } from "../data/tutorialDeck";
import { parseMovetext } from "./pgn";
import { answerNodeIds, linkMoves, tidyPgnSyntax } from "./richText";
import { moveLabel } from "./pgn";

const immortal = buildTutorialCards().find((card) => card.answer[0].san === "Bd6")!;
const legal = buildTutorialCards().find((card) => card.answer[0].san === "Nxe5")!;

function treeOf(card: { fen: string; continuation: string }) {
  const parsed = parseMovetext(card.continuation, card.fen);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.tree;
}

const moves = (pieces: ReturnType<typeof linkMoves>) => pieces.filter((piece) => piece.kind === "move").map((piece) => piece.text);

describe("tidying PGN syntax in an explanation", () => {
  it("drops braces and writes out glyphs", () => {
    expect(tidyPgnSyntax("18. Bd6 $1 {The bishop takes the dark squares} 18... Bxg1")).toBe(
      "18. Bd6 ! The bishop takes the dark squares 18... Bxg1",
    );
  });

  it("knows the common glyphs and ignores unknown ones", () => {
    expect(tidyPgnSyntax("a $2 b $3 c $4 d $5 e $6 f $99")).toBe("a ? b !! c ?? d !? e ?! f ");
  });
});

describe("finding moves in an explanation", () => {
  const tree = treeOf(immortal);

  it("ties each numbered move to the continuation", () => {
    const pieces = linkMoves(immortal.explanation, tree);
    expect(moves(pieces).slice(0, 4)).toEqual(["18. Bd6!", "18... Bxg1", "19. e5", "Qxa1+"]);
    for (const piece of pieces) {
      if (piece.kind === "move") expect(tree.nodes[piece.nodeId]).toBeDefined();
    }
  });

  it("keeps the sentence words around the moves", () => {
    const text = linkMoves(immortal.explanation, tree)
      .map((piece) => piece.text)
      .join("");
    expect(text).toContain("The bishop takes the dark squares");
    expect(text.replace(/\s+/g, " ")).toBe(immortal.explanation.replace(/\s+/g, " "));
  });

  it("points a click at the right position", () => {
    const [first] = linkMoves(immortal.explanation, tree).filter((piece) => piece.kind === "move");
    if (first.kind !== "move") throw new Error("expected a move");
    expect(moveLabel(tree, first.nodeId)).toBe("18. Bd6");
  });

  it("follows a continuing run without numbers", () => {
    const [, ...rest] = moves(linkMoves("18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6", tree));
    expect(rest).toEqual(["Bxg1", "19. e5", "Qxa1+", "20. Ke2", "Na6"]);
  });

  it("finds a move that only exists in a variation", () => {
    const legalTree = treeOf(legal);
    const found = linkMoves("If Black takes the knight, 5... dxe5 6. Qxg4 wins a piece.", legalTree);
    expect(moves(found)).toEqual(["5... dxe5", "6. Qxg4"]);
  });

  it("doesn't turn squares named in a sentence into moves", () => {
    const found = linkMoves("The bishop on g5 guards d8, and the knight on d7 is gone.", treeOf(immortal));
    expect(moves(found)).toEqual([]);
  });

  it("leaves a move that isn't in the continuation as plain text", () => {
    const found = linkMoves("What about 18. Qh5 instead?", tree);
    expect(moves(found)).toEqual([]);
  });

  it("returns the text unchanged when there is no continuation", () => {
    expect(linkMoves("18. Bd6!", null)).toEqual([{ kind: "text", text: "18. Bd6!" }]);
  });

  it("reads a pasted PGN-style comment", () => {
    const found = linkMoves("18. Bd6 $1 {The bishop... It ends } 18... Bxg1 19. e5", tree);
    expect(moves(found)).toEqual(["18. Bd6", "18... Bxg1", "19. e5"]);
    expect(found.map((piece) => piece.text).join("")).toContain("!");
    expect(found.map((piece) => piece.text).join("")).not.toContain("{");
  });
});

describe("the answer's moves", () => {
  it("finds the answer at the start of the continuation", () => {
    const tree = treeOf(immortal);
    const ids = answerNodeIds(tree, immortal.answer)!;
    expect(ids.map((id) => moveLabel(tree, id))).toEqual(["18. Bd6"]);
  });

  it("gives up when the continuation doesn't start with the answer", () => {
    const tree = treeOf(immortal);
    expect(answerNodeIds(tree, [{ from: "a1", to: "a2" }])).toBeNull();
    expect(answerNodeIds(null, immortal.answer)).toBeNull();
  });
});
