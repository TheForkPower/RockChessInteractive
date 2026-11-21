import { type GradingMode } from "../../domain/settings";
import { Segmented } from "../../ui/Segmented";

type Props = {
  value: GradingMode;
  onChange: (value: GradingMode) => void;
};

const NOTES: Record<GradingMode, string> = {
  manual: "You press Again, Hard, Good or Easy after each card. The app suggests one, but you choose.",
  smart:
    "The app picks the grade from how the card went: wrong tries, a hint, and how long you took. You can change it before moving on.",
};

/** Manual or smart grading. Settings uses it now, and sign-up can use it later. */
export function GradingChoice({ value, onChange }: Props) {
  return (
    <div>
      <Segmented
        label="How cards are graded"
        value={value}
        options={[
          { value: "manual", label: "Manual" },
          { value: "smart", label: "Smart" },
        ]}
        onChange={onChange}
      />
      <p className="mt-3 text-sm text-ink-soft">{NOTES[value]}</p>
    </div>
  );
}
