import { Button } from "./Button";
import type { ButtonVariant } from "./buttonClass";

export type Grade = "again" | "hard" | "good" | "easy";

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
};

export function GradeButton({ grade, interval, onSelect, disabled }: GradeButtonProps) {
  const { label, variant } = grades[grade];
  return (
    <Button variant={variant} className="btn-grade" disabled={disabled} onClick={() => onSelect?.(grade)}>
      <span>{label}</span>
      <span className="interval">{interval}</span>
    </Button>
  );
}
