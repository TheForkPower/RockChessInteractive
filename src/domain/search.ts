import { CATEGORIES, type Card } from "./cards";

const labelOf = (card: Card) => CATEGORIES.find((option) => option.value === card.category)?.label ?? card.category;

/** Everything a person might search a card by, in lower case. */
export function searchText(card: Card): string {
  return [
    card.prompt,
    card.hint,
    card.explanation,
    card.notes,
    card.answer.map((move) => move.san).join(" "),
    card.alternatives.map((move) => move.san).join(" "),
    card.tags.join(" "),
    labelOf(card),
    card.fen,
  ]
    .join("\n")
    .toLowerCase();
}

/** Every word in the query has to appear somewhere on the card. An empty query matches everything. */
export function matchesQuery(card: Card, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = searchText(card);
  return words.every((word) => text.includes(word));
}

/** Every tag used on these cards, most used first, then A to Z. Tags that differ only in capital letters count as one. */
export function tagsOf(cards: Card[]): string[] {
  const seen = new Map<string, { name: string; count: number }>();
  for (const card of cards) {
    for (const tag of card.tags) {
      const key = tag.toLowerCase();
      const entry = seen.get(key);
      if (entry) entry.count += 1;
      else seen.set(key, { name: tag, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((entry) => entry.name);
}

export const hasTag = (card: Card, tag: string) => card.tags.some((item) => item.toLowerCase() === tag.toLowerCase());
