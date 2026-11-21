import { Link } from "react-router";
import { colorOf, gradientOf } from "../../domain/deckColors";
import { Checker } from "../decks/DeckTile";

const recall = colorOf({ id: "", theme: "tutorial" });

/** The front door. For now there is one place to go: Recall. */
export function HomePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold sm:text-5xl">Home</h1>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li
          className="relative isolate flex min-h-[11.5rem] flex-col justify-between rounded-3xl p-5 text-white shadow-[0_4px_0_rgba(0,0,0,0.22)] sm:p-6"
          style={{ background: gradientOf(recall) }}
        >
          <Checker />
          <h2 className="relative z-10 text-2xl font-bold leading-tight sm:text-3xl">
            <Link
              to="/recall"
              className="rounded-lg after:absolute after:inset-0 after:z-10 after:rounded-3xl focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-4 focus-visible:after:outline-offset-2 focus-visible:after:outline-ink"
            >
              Recall
            </Link>
          </h2>
          <p className="relative z-10 mt-2 max-w-[22ch] text-white/90">Learn the moves you want to remember, then review them.</p>
        </li>
      </ul>
      <p className="mt-16 text-sm text-ink-soft">
        <Link to="/design" className="rounded underline underline-offset-4 hover:text-ink">
          Design system
        </Link>
      </p>
    </div>
  );
}
