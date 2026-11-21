import { Link } from "react-router";
import { useAllCards } from "../../data/hooks";
import { answerText } from "../../domain/cards";
import { matchesQuery } from "../../domain/search";
import { fieldClass } from "../../ui/Field";

const LIMIT = 50;

type BoxProps = { value: string; onChange: (value: string) => void };

export function SearchBox({ value, onChange }: BoxProps) {
  return (
    <div className="max-w-xl">
      <label htmlFor="all-search" className="block font-display text-lg font-bold">
        Search all cards
      </label>
      <input
        id="all-search"
        type="search"
        className={`${fieldClass} mt-2`}
        value={value}
        placeholder="A move, a word, a tag"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** The cards in every deck that match what was typed. Each one opens in its deck. */
export function SearchResults({ query }: { query: string }) {
  const all = useAllCards();
  if (all === undefined) return <p className="mt-8 text-ink-soft">Searching…</p>;
  if (all === null) return <p className="mt-8 text-ink-soft">Can't read your cards. Storage may be blocked in this browser.</p>;

  const found = all.filter((entry) => matchesQuery(entry.card, query));
  if (found.length === 0) return <p className="mt-8 text-ink-soft">No cards match.</p>;

  return (
    <section aria-label="Search results" className="mt-8">
      <p className="font-semibold text-ink-soft" aria-live="polite">
        {found.length === 1 ? "1 card" : `${found.length} cards`}
        {found.length > LIMIT ? `, showing the first ${LIMIT}` : ""}
      </p>
      <ul className="mt-3 space-y-3">
        {found.slice(0, LIMIT).map(({ card, deckName }) => (
          <li key={card.id}>
            <Link
              to={`/decks?deck=${card.deckId}&card=${card.id}`}
              className="panel block p-4 transition-colors hover:bg-line/30"
            >
              <span className="block font-display text-lg font-bold">{card.prompt}</span>
              <span className="mt-1 block font-mono text-sm text-ink-soft">
                {card.kind === "move" ? "Answer" : "Line"}: {answerText(card.fen, card.answer)}
              </span>
              <span className="mt-1 block text-sm text-ink-soft">
                {deckName}
                {card.tags.length > 0 ? `. ${card.tags.join(", ")}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
