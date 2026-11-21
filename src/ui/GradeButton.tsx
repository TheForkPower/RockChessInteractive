import type { Grade } from "../domain/scheduling";
import { Button } from "./Button";
import type { ButtonVariant } from "./buttonClass";

export type { Grade };

const grades: Record<Grade, { label: string; variant: ButtonVariant }> = {
  again: { label: "Again", variant: "danger" },
  hard: { label: "Hard", variant: "caution" },
  good: { label: "Good", variant: "good" },
  easy: { label: "Easy", variant: "primary" },
};

type GradeButtonProps = {
  grade: Grade;
  /** When the card will come back if this grade is chosen, e.g. "10 min". */
  interval: string;
  onSelect?: (grade: Grade) => void;
  disabled?: boolean;
  /** Marks the grade the app suggests. The reason is given in text next to the buttons. */
  suggested?: boolean;
};

export function GradeButton({ grade, interval, onSelect, disabled, suggested }: GradeButtonProps) {
  const { label, variant } = grades[grade];
  return (
    <div className="relative">
      <Button variant={variant} className="btn-grade" disabled={disabled} onClick={() => onSelect?.(grade)}>
        <span>{label}</span>
        <span className="interval">{interval}</span>
      </Button>
      {suggested ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white"
        >
          Suggested
        </span>
      ) : null}
    </div>
  );
}
