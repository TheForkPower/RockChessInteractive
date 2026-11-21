import { describe, expect, it } from "vitest";
import { colorOf, contrast, DECK_COLORS, findColor, nextColor } from "./deckColors";

describe("deck colours", () => {
  it("has unique ids", () => {
    expect(new Set(DECK_COLORS.map((color) => color.id)).size).toBe(DECK_COLORS.length);
  });

  it("keeps white text readable on both ends of every gradient", () => {
    for (const color of DECK_COLORS) {
      expect(contrast("#ffffff", color.from), `${color.id} from`).toBeGreaterThanOrEqual(4.6);
      expect(contrast("#ffffff", color.to), `${color.id} to`).toBeGreaterThanOrEqual(4.6);
    }
  });

  it("keeps the dark ink readable on each colour's wash", () => {
    for (const color of DECK_COLORS) expect(contrast("#1d2733", color.wash), color.id).toBeGreaterThanOrEqual(7);
  });

  it("uses the colour a deck was given", () => {
    expect(colorOf({ id: "x", color: "teal" })).toBe(findColor("teal"));
  });

  it("gives an uncoloured deck the same colour every time", () => {
    expect(colorOf({ id: "abc" })).toBe(colorOf({ id: "abc" }));
  });

  it("ignores a colour that isn't in the palette", () => {
    expect(DECK_COLORS).toContain(colorOf({ id: "abc", color: "chartreuse" }));
  });

  it("picks an unused colour for a new deck, and cycles once all are used", () => {
    expect(nextColor(["ember", "forest"], 2).id).toBe("violet");
    expect(nextColor(DECK_COLORS.map((color) => color.id), 3).id).toBe(DECK_COLORS[3].id);
  });

  it("measures contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});
