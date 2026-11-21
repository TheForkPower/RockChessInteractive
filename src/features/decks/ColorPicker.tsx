import { DECK_COLORS, gradientOf } from "../../domain/deckColors";
import { CheckIcon } from "../../ui/Icons";

type Props = { value: string; onChange: (id: string) => void };

/** A row of colour swatches, one picked. */
export function ColorPicker({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Deck colour" className="flex flex-wrap gap-3">
      {DECK_COLORS.map((color) => {
        const active = color.id === value;
        return (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={color.label}
            title={color.label}
            onClick={() => onChange(color.id)}
            className={[
              "grid size-11 place-items-center rounded-full text-white shadow-[0_3px_0_rgba(0,0,0,0.2)] transition-transform hover:scale-105",
              active ? "ring-4 ring-ink/70 ring-offset-2" : "",
            ].join(" ")}
            style={{ background: gradientOf(color) }}
          >
            {active ? <CheckIcon width={20} height={20} /> : null}
          </button>
        );
      })}
    </div>
  );
}
