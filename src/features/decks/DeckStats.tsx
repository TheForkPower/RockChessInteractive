import type { DeckSummary } from "../../data/repo";

export type StatusFilter = "new" | "learning" | "mastered" | "due";

const ITEMS: { key: StatusFilter; label: string; count: (deck: DeckSummary) => number }[] = [
  { key: "new", label: "New", count: (deck) => deck.newCount },
  { key: "learning", label: "Learning", count: (deck) => deck.learningCount },
  { key: "mastered", label: "Mastered", count: (deck) => deck.masteredCount },
  { key: "due", label: "Due", count: (deck) => deck.dueCount },
];

type Props = {
  deck: DeckSummary;
  active: StatusFilter | null;
  /** Called with the filter pressed, or null when the one that is on is pressed again. */
  onChange: (filter: StatusFilter | null) => void;
};

/** How many cards are new, being learned, mastered and due. Each one also filters the list below. */
export function DeckStats({ deck, active, onChange }: Props) {
  return (
    <div role="group" aria-label="Cards by status" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ITEMS.map((item) => {
        const on = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : item.key)}
            className={[
              "rounded-2xl border-2 px-4 py-3 text-left transition-colors",
              on ? "border-brand bg-brand-wash" : "border-line-strong bg-surface hover:bg-line/40",
            ].join(" ")}
          >
            <span className="block font-display text-2xl font-bold tabular-nums">{item.count(deck)}</span>
            <span className="block text-sm font-semibold text-ink-soft">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
