import { SessionStart } from "../review/SessionStart";
import { PracticeCards } from "./PracticeCards";

const steps = [
  "Paste a PGN or FEN and pick the position you want to remember.",
  "Learn it by playing the moves yourself.",
  "Review it when it is due, not before.",
];

const points = [
  "Make cards from positions in your PGNs",
  "Play the answer on the board",
  "Each card comes back when it's due",
];

/** The landing page for Recall, the learn-and-review part of the site. */
export function RecallPage() {
  return (
    <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="max-w-xl">
        <h1 className="text-5xl/[1.05] font-bold sm:text-6xl/[1.05]">Anki for chess positions</h1>
        <ul className="mt-6 list-disc space-y-1.5 pl-6 text-lg text-ink-soft marker:text-brand">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        <div className="mt-10">
          <SessionStart />
        </div>
      </div>

      <div className="lg:row-span-2 lg:row-start-1 lg:col-start-2">
        <PracticeCards />
      </div>

      <div className="max-w-xl lg:row-start-2">
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash font-display font-bold text-brand">
                {index + 1}
              </span>
              <span className="pt-0.5 text-lg">{step}</span>
            </li>
          ))}
        </ol>

      </div>
    </div>
  );
}
