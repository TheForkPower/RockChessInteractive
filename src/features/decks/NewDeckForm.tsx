import { useState, type FormEvent } from "react";
import { createDeck, STORAGE_ERROR } from "../../data/repo";
import { Button } from "../../ui/Button";
import { fieldClass } from "../../ui/Field";

type Props = {
  /** Called with the new deck's id once it is saved. */
  onCreated: (deckId: string) => void;
  /** Leave out when the form has to stay, because there are no decks yet. */
  onCancel?: () => void;
};

/** Asks for a name and makes an empty deck. Cards are added to it afterwards, from the deck's own page. */
export function NewDeckForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const made = await createDeck(name);
      if (made.ok) onCreated(made.deck.id);
      else setError(made.error);
    } catch {
      setError(STORAGE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <label htmlFor="new-deck-name" className="block font-display text-xl font-bold">
        Name your deck
      </label>
      <input
        id="new-deck-name"
        className={`${fieldClass} mt-3`}
        value={name}
        placeholder="Sicilian Najdorf"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "new-deck-error" : undefined}
        onChange={(event) => setName(event.target.value)}
      />
      {error ? (
        <p id="new-deck-error" role="alert" className="mt-2 font-semibold text-bad-edge">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          Create deck
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
