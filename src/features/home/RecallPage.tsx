import learnScreen from "../../assets/recall-learn.webp";
import { ButtonLink } from "../../ui/Button";
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

const features = [
  {
    title: "Make cards from your own material",
    text: "Paste a PGN or a FEN, set a position up on the board, or play a line out. A card can be one move or a whole line, and the variations in your PGN stay on the back.",
  },
  {
    title: "Learn a new card by playing it",
    text: "A new card shows you the answer first. Then you play it from memory, and it is scheduled once you get it right.",
  },
  {
    title: "Review it when it's due",
    text: "Each card comes back after a gap worked out with FSRS. You say how it went, or turn on smart grading and the app picks from your accuracy and speed.",
  },
  {
    title: "Drill the hard ones",
    text: "Cards you keep getting wrong are copied into a Difficult moves deck, so you can go at them on their own.",
  },
  {
    title: "Keep your data",
    text: "Decks, cards and progress are saved in your browser. Download a backup file whenever you like, and restore it on another machine.",
  },
];

/** The landing page for Recall, the learn-and-review part of the site. */
export function RecallPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
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

      <section aria-labelledby="what-you-can-do" className="mt-6 border-t-2 border-line pt-14 lg:col-span-2">
        <h2 id="what-you-can-do" className="text-3xl font-bold sm:text-4xl">
          What you can do here
        </h2>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <figure className="lg:sticky lg:top-6">
            <img
              src={learnScreen}
              width={1600}
              height={1398}
              loading="lazy"
              alt="The Learn screen. A chessboard on the left, and on the right the message Correct, the answer, the reason for the move and a Next card button."
              className="w-full rounded-3xl border-2 border-line-strong bg-surface"
            />
            <figcaption className="mt-3 text-sm text-ink-soft">Learn mode, just after the answer has been played.</figcaption>
          </figure>
          <div>
            <dl className="space-y-6">
              {features.map((feature) => (
                <div key={feature.title}>
                  <dt className="font-display text-xl font-bold">{feature.title}</dt>
                  <dd className="mt-1 text-lg text-ink-soft">{feature.text}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/create">Make cards</ButtonLink>
              <ButtonLink to="/decks" variant="secondary">
                Open your decks
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
