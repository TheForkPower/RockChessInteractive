import { Link } from "react-router";
import { Button } from "../../ui/Button";

const steps = [
  "Paste a PGN or FEN and pick the position you want to remember.",
  "Learn it by playing the moves yourself.",
  "Review it when it is due, not before.",
];

export function HomePage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-5xl/[1.05] font-bold sm:text-6xl/[1.05]">Chess positions you won't forget.</h1>
      <p className="mt-6 text-lg text-ink-soft">
        Turn the positions that matter into cards, then see each one again just before you would forget it.
      </p>

      <div className="mt-10">
        <Button size="lg" disabled aria-describedby="start-note">
          Start learning &amp; review
        </Button>
        <p id="start-note" className="mt-4 text-sm text-ink-soft">
          Not built yet. Reviewing arrives in milestone 3 and learning in milestone 5.
        </p>
      </div>

      <ol className="mt-14 space-y-4">
        {steps.map((step, index) => (
          <li key={step} className="flex items-start gap-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash font-display font-bold text-brand">
              {index + 1}
            </span>
            <span className="pt-0.5 text-lg">{step}</span>
          </li>
        ))}
      </ol>

      <p className="mt-16 text-sm text-ink-soft">
        <Link to="/design" className="rounded underline underline-offset-4 hover:text-ink">
          Design system
        </Link>
      </p>
    </div>
  );
}
