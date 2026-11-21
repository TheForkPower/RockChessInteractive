import type { DeckSummary } from "../../data/repo";
import { Field, fieldClass } from "../../ui/Field";

export const NEW_DECK = "__new";

type Props = {
  decks: DeckSummary[];
  /** An existing deck's id, or NEW_DECK. */
  value: string;
  newName: string;
  onChange: (value: string, newName: string) => void;
  error?: string | null;
  allowNew?: boolean;
};

/** Choose a deck, or name a new one. With no decks yet, it only asks for a name. */
export function DeckPicker({ decks, value, newName, onChange, error, allowNew = true }: Props) {
  return (
    <>
      {decks.length > 0 ? (
        <Field id="deck" label="Deck">
          {(aria) => (
            <select {...aria} className={fieldClass} value={value} onChange={(event) => onChange(event.target.value, newName)}>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name} ({deck.cardCount})
                </option>
              ))}
              {allowNew ? <option value={NEW_DECK}>New deck…</option> : null}
            </select>
          )}
        </Field>
      ) : null}
      {value === NEW_DECK ? (
        <Field id="deck-name" label="New deck name" error={error}>
          {(aria) => (
            <input
              {...aria}
              className={fieldClass}
              value={newName}
              onChange={(event) => onChange(value, event.target.value)}
              placeholder="Sicilian Najdorf"
            />
          )}
        </Field>
      ) : null}
    </>
  );
}
