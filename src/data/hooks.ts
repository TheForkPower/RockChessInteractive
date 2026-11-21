import { useLiveQuery } from "dexie-react-hooks";
import type { Card } from "../domain/cards";
import { DEFAULT_SETTINGS, type Settings } from "../domain/settings";
import type { Schedule } from "../domain/scheduling";
import type { ReviewEntry } from "./db";
import { getSettings, listReviews, listSchedules } from "./progress";
import { listCards, listDecks, type DeckSummary } from "./repo";

/**
 * Live views of saved data. Each returns undefined while loading and null if
 * the browser won't let the app read its storage.
 */
export function useDecks(): DeckSummary[] | null | undefined {
  return useLiveQuery(async () => {
    try {
      return await listDecks();
    } catch {
      return null;
    }
  }, []);
}

export function useCards(deckId: string | null): Card[] | null | undefined {
  return useLiveQuery(
    async () => {
      if (!deckId) return [];
      try {
        return await listCards(deckId);
      } catch {
        return null;
      }
    },
    [deckId],
  );
}

/** Settings, with the defaults until they have loaded. */
export function useSettings(): Settings {
  return useLiveQuery(() => getSettings().catch(() => DEFAULT_SETTINGS), [], DEFAULT_SETTINGS);
}

/** The saved schedule of every graded card in a deck, by card id. */
export function useSchedules(deckId: string): Record<string, Schedule> | undefined {
  return useLiveQuery(() => listSchedules(deckId).catch(() => ({})), [deckId]);
}

export function useCardReviews(cardId: string | null): ReviewEntry[] | undefined {
  return useLiveQuery(() => (cardId ? listReviews(cardId).catch(() => []) : []), [cardId]);
}
