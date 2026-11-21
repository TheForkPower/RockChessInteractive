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

  it("shows the starter deck as ember and the Difficult moves deck as orange even with no colour saved", () => {
    expect(colorOf({ id: "a", theme: "tutorial" }).id).toBe("ember");
    expect(colorOf({ id: "a", theme: "difficult" }).id).toBe("orange");
    expect(colorOf({ id: "a", theme: "tutorial", color: "teal" }).id).toBe("teal");
  });

  it("ignores a colour that isn't in the palette", () => {
    expect(DECK_COLORS).toContain(colorOf({ id: "abc", color: "chartreuse" }));
  });

  it("picks an unused colour for a new deck, and cycles once all are used", () => {
    expect(nextColor(["forest", "violet"], 2).id).toBe("rose");
    const pool = DECK_COLORS.filter((color) => color.id !== "ember" && color.id !== "orange");
    expect(nextColor(DECK_COLORS.map((color) => color.id), 3).id).toBe(pool[3].id);
  });

  it("keeps ember and orange for the special decks", () => {
    const picked = new Set<string>();
    const used: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const color = nextColor(used, i).id;
      picked.add(color);
      used.push(color);
    }
    expect(picked.has("ember")).toBe(false);
    expect(picked.has("orange")).toBe(false);
  });

  it("measures contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});
