import { useLiveQuery } from "dexie-react-hooks";
import type { Card } from "../domain/cards";
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
