import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import { START_FEN } from "./fen";
import { cardStatus } from "./scheduling";
import { hasTag, matchesQuery, tagsOf } from "./search";

const card = (overrides: Partial<Card> = {}): Card => ({
  id: "c1",
  deckId: "d1",
  kind: "move",
  category: "opening",
  fen: START_FEN,
  side: "w",
  prompt: "Open the centre",
  hint: "",
  answer: [{ from: "e2", to: "e4", san: "e4" }],
  alternatives: [{ from: "d2", to: "d4", san: "d4" }],
  explanation: "Grabs space.",
  continuation: "",
  notes: "",
  tags: ["Italian", "main line"],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe("searching cards", () => {
  it("matches everything for an empty search", () => {
    expect(matchesQuery(card(), "")).toBe(true);
    expect(matchesQuery(card(), "   ")).toBe(true);
  });

  it("looks in the question, explanation, moves, tags and category, ignoring case", () => {
    expect(matchesQuery(card(), "CENTRE")).toBe(true);
    expect(matchesQuery(card(), "space")).toBe(true);
    expect(matchesQuery(card(), "e4")).toBe(true);
    expect(matchesQuery(card(), "d4")).toBe(true);
    expect(matchesQuery(card(), "italian")).toBe(true);
    expect(matchesQuery(card(), "opening")).toBe(true);
  });

  it("needs every word to be there, in any order", () => {
    expect(matchesQuery(card(), "space centre")).toBe(true);
    expect(matchesQuery(card(), "space rook")).toBe(false);
  });

  it("finds nothing for a word that isn't on the card", () => {
    expect(matchesQuery(card(), "sicilian")).toBe(false);
  });
});

describe("tags", () => {
  it("lists each tag once, most used first, treating capitals as the same tag", () => {
    const cards = [card({ tags: ["Italian", "tactic"] }), card({ tags: ["italian"] }), card({ tags: ["tactic", "a"] }), card({ tags: ["italian"] })];
    expect(tagsOf(cards)).toEqual(["Italian", "tactic", "a"]);
  });

  it("checks for a tag without minding capitals", () => {
    expect(hasTag(card(), "italian")).toBe(true);
    expect(hasTag(card(), "sicilian")).toBe(false);
  });
});

describe("card status", () => {
  const schedule = (state: 0 | 1 | 2 | 3, scheduledDays: number) => ({ state, scheduledDays });

  it("is new until the card has been graded", () => {
    expect(cardStatus(undefined)).toBe("new");
    expect(cardStatus(null)).toBe("new");
  });

  it("is learning while the gap is short, or after a lapse", () => {
    expect(cardStatus(schedule(1, 0))).toBe("learning");
    expect(cardStatus(schedule(2, 20))).toBe("learning");
    expect(cardStatus(schedule(3, 40))).toBe("learning");
  });

  it("is mastered once a review card has a gap of 21 days or more", () => {
    expect(cardStatus(schedule(2, 21))).toBe("mastered");
    expect(cardStatus(schedule(2, 90))).toBe("mastered");
  });
});
