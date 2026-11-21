import { Link } from "react-router";
import type { DeckSummary } from "../../data/repo";
import { colorOf, gradientOf } from "../../domain/deckColors";
import { ChevronRightIcon } from "../../ui/Icons";
import { Menu } from "../../ui/Menu";

export const pillClass =
  "relative z-10 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 font-display font-bold text-ink shadow-[0_3px_0_rgba(0,0,0,0.22)] transition-transform hover:bg-white/90 active:translate-y-px active:shadow-[0_2px_0_rgba(0,0,0,0.22)]";
export const pillOffClass =
  "relative z-10 inline-flex cursor-not-allowed items-center gap-1 rounded-full bg-white/60 px-4 py-2 font-display font-bold text-ink/70";

/** A quiet chessboard pattern in the corner, fading towards the middle of the tile. */
export function Checker() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      <span
        className="absolute inset-y-0 right-0 w-3/5"
        style={{
          backgroundImage:
            "conic-gradient(rgba(255,255,255,0.16) 25%, transparent 0 50%, rgba(255,255,255,0.16) 0 75%, transparent 0)",
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(to left, black, transparent)",
          WebkitMaskImage: "linear-gradient(to left, black, transparent)",
        }}
      />
    </span>
  );
}

type PlayLinksProps = { deckId: string; name: string; cardCount: number; describedBy: string };

/** The Review and Learn buttons. With no cards in the deck they stay put but say why. */
export function PlayLinks({ deckId, name, cardCount, describedBy }: PlayLinksProps) {
  if (cardCount === 0) {
    return (
      <>
        <button type="button" aria-disabled="true" aria-describedby={describedBy} className={pillOffClass}>
          Review
        </button>
        <button type="button" aria-disabled="true" aria-describedby={describedBy} className={pillOffClass}>
          Learn
        </button>
      </>
    );
  }
  return (
    <>
      <Link to={`/review?deck=${deckId}`} aria-label={`Review ${name}`} className={pillClass}>
        Review
        <ChevronRightIcon width={18} height={18} />
      </Link>
      <Link to={`/review?deck=${deckId}&mode=learn`} aria-label={`Learn ${name}`} className={pillClass}>
        Learn
        <ChevronRightIcon width={18} height={18} />
      </Link>
    </>
  );
}

/** One deck as a coloured pack of cards. */
export function DeckTile({ deck }: { deck: DeckSummary }) {
  const color = colorOf(deck);
  const cards = deck.cardCount === 1 ? "1 card" : `${deck.cardCount} cards`;
  const label = deck.theme === "tutorial" ? `Starter deck, ${cards}` : deck.theme === "difficult" ? `Fills itself, ${cards}` : cards;
  const note = `empty-${deck.id}`;
  const open = `/decks?deck=${deck.id}`;
  return (
    <li
      className="relative isolate flex min-h-[11.5rem] flex-col justify-between rounded-3xl p-5 text-white shadow-[0_4px_0_rgba(0,0,0,0.22)] sm:p-6"
      style={{ background: gradientOf(color) }}
    >
      <Checker />
      <div className="relative z-20 flex items-start justify-between gap-3">
        <p className="pt-2 text-sm font-semibold text-white/90">{label}</p>
        <Menu
          tone="dark"
          label={`More options for ${deck.name}`}
          items={[
            { label: "Edit cards", to: open },
            { label: "Rename", to: `${open}&do=rename` },
            { label: "Change colour", to: `${open}&do=colour` },
            { label: "Delete deck", to: `${open}&do=delete`, danger: true },
          ]}
        />
      </div>
      <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
        <Link
          to={open}
          className="rounded-lg after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-4 focus-visible:after:-outline-offset-4 focus-visible:after:outline-white"
        >
          {deck.name}
        </Link>
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <PlayLinks deckId={deck.id} name={deck.name} cardCount={deck.cardCount} describedBy={note} />
      </div>
      {deck.cardCount === 0 ? (
        <p id={note} className="relative z-10 mt-3 text-sm text-white/90">
          This deck has no cards yet.
        </p>
      ) : null}
    </li>
  );
}

/** The Difficult moves deck: a smaller strip below the other decks, not a pack among them. */
export function DifficultStrip({ deck }: { deck: DeckSummary }) {
  const color = colorOf(deck);
  const open = `/decks?deck=${deck.id}`;
  const note = `difficult-note-${deck.id}`;
  const cards = deck.cardCount === 1 ? "1 card" : `${deck.cardCount} cards`;
  return (
    <section
      aria-labelledby={`difficult-${deck.id}`}
      className="relative isolate mt-12 max-w-2xl rounded-2xl px-5 py-4 text-white shadow-[0_3px_0_rgba(0,0,0,0.22)]"
      style={{ background: gradientOf(color) }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id={`difficult-${deck.id}`} className="text-lg font-bold leading-tight">
            <Link
              to={open}
              className="rounded-lg after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-4 focus-visible:after:-outline-offset-4 focus-visible:after:outline-white"
            >
              {deck.name}
            </Link>
          </h2>
          <p id={note} className="mt-0.5 text-sm text-white/90">
            {deck.cardCount === 0 ? "This deck has no cards yet. Make some bad moves and it will be filled! :)" : `Fills itself as you practise. ${cards}.`}
          </p>
        </div>
        {deck.cardCount > 0 ? (
          <div className="relative z-20 flex gap-2">
            <PlayLinks deckId={deck.id} name={deck.name} cardCount={deck.cardCount} describedBy={note} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
