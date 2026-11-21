/**
 * Colours a deck can wear. Each has two ends for the tile gradient, plus a pale
 * wash and a line colour for the panel behind the deck's cards. White text sits
 * on the gradient, so both ends are dark enough to read it (checked in the tests).
 */
export type DeckColor = {
  id: string;
  label: string;
  from: string;
  to: string;
  wash: string;
  line: string;
};

export const DECK_COLORS: DeckColor[] = [
  { id: "ember", label: "Ember", from: "#c2480b", to: "#a3241a", wash: "#fdf0e6", line: "#f0c9ac" },
  { id: "forest", label: "Forest", from: "#1f7a4d", to: "#145a38", wash: "#e6f4ec", line: "#b4dcc4" },
  { id: "violet", label: "Violet", from: "#7140b8", to: "#4d2a8a", wash: "#f0eaf9", line: "#d1c1ea" },
  { id: "rose", label: "Rose", from: "#bf3466", to: "#8f2150", wash: "#fbe9f0", line: "#efbdd2" },
  { id: "ocean", label: "Ocean", from: "#1c6cb5", to: "#174d93", wash: "#e6f0fa", line: "#b7d3ee" },
  { id: "indigo", label: "Indigo", from: "#3a56d4", to: "#2a3fa6", wash: "#e8ecfc", line: "#c3cdf3" },
  { id: "teal", label: "Teal", from: "#0e7a80", to: "#0a5961", wash: "#e2f3f4", line: "#afdadd" },
  { id: "walnut", label: "Walnut", from: "#7d4b2a", to: "#573220", wash: "#f4ece6", line: "#dcc7b8" },
  { id: "slate", label: "Slate", from: "#4c5767", to: "#313a49", wash: "#eceff2", line: "#c9d0d9" },
  { id: "crimson", label: "Crimson", from: "#b52d2d", to: "#841d27", wash: "#fae8e8", line: "#ebbcbc" },
];

export function findColor(id: string | undefined): DeckColor | undefined {
  return DECK_COLORS.find((color) => color.id === id);
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

/** The colour a deck shows: the one it was given, or a steady pick based on its id. */
export function colorOf(deck: { id: string; color?: string }): DeckColor {
  return findColor(deck.color) ?? DECK_COLORS[hash(deck.id) % DECK_COLORS.length];
}

/** The first colour no other deck is using, so new decks look different from each other. */
export function nextColor(used: (string | undefined)[], seed: number): DeckColor {
  return DECK_COLORS.find((color) => !used.includes(color.id)) ?? DECK_COLORS[seed % DECK_COLORS.length];
}

export const gradientOf = (color: DeckColor) => `linear-gradient(135deg, ${color.from}, ${color.to})`;

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
    const [r, g, bl] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
