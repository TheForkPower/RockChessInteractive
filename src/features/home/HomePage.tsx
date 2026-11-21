import { Link } from "react-router";
import { Button } from "../../ui/Button";
import { PracticeCards } from "./PracticeCards";

const steps = [
  "Paste a PGN or FEN and pick the position you want to remember.",
  "Learn it by playing the moves yourself.",
  "Review it when it is due, not before.",
];

export function HomePage() {
  return (
    <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="max-w-xl">
        <h1 className="text-5xl/[1.05] font-bold sm:text-6xl/[1.05]">Anki for chess positions.</h1>
        <p className="mt-6 text-lg text-ink-soft">
          Make cards from positions in your PGNs, play the answer on the board, and each card comes back when it's
          due.
        </p>

        <div className="mt-10">
          <Button size="lg" disabled aria-describedby="start-note">
            Start learning &amp; review
          </Button>
          <p id="start-note" className="mt-4 text-sm text-ink-soft">
            Not built yet. Reviewing arrives in milestone 3 and learning in milestone 5.
          </p>
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

        <p className="mt-14 text-sm text-ink-soft">
          <Link to="/design" className="rounded underline underline-offset-4 hover:text-ink">
            Design system
          </Link>
        </p>
      </div>
    </div>
  );
}
