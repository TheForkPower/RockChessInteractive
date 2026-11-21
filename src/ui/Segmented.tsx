type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

/** A row of choices where exactly one is picked. */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-3">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={[
              "rounded-xl border-2 px-4 py-2 font-display font-bold transition-colors",
              active ? "border-brand bg-brand-wash text-brand" : "border-line-strong bg-surface text-ink hover:bg-line/40",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
