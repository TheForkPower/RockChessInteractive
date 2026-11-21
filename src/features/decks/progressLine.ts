import type { DeckSummary } from "../../data/repo";

/** "3 due, 2 new", or "Nothing due" when cards are waiting for their day. Empty for a deck with no cards. */
export function progressLine(deck: Pick<DeckSummary, "cardCount" | "dueCount" | "newCount">): string {
  if (deck.cardCount === 0) return "";
  const parts = [deck.dueCount > 0 ? `${deck.dueCount} due` : "", deck.newCount > 0 ? `${deck.newCount} new` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Nothing due";
}
