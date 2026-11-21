import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { markDifficult, recordStruggle } from "../../data/difficult";
import { getDeck, listCards, STORAGE_ERROR } from "../../data/repo";
import type { Deck } from "../../data/db";
import type { Card } from "../../domain/cards";
import { colorOf } from "../../domain/deckColors";
import { isStruggle, OUTCOME_LABELS, type Outcome, type Tally } from "../../domain/review";
import { Button, ButtonLink } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { ChevronLeftIcon } from "../../ui/Icons";
import { ReviewCard } from "./ReviewCard";

type Loaded =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; deck: Deck; cards: Card[] };

const REPLY_DELAY_MS = 650;

type SessionProps = {
  deck: Deck;
  cards: Card[];
  mode: "review" | "learn";
  replyDelay: number;
};

function Session({ deck, cards, mode, replyDelay }: SessionProps) {
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<Record<string, Outcome>>({});
  const [ended, setEnded] = useState(false);
  const color = colorOf(deck);
  const verb = mode === "learn" ? "Learn" : "Review";

  const done = Object.keys(results).length;
  const card = cards[index];

  function record(item: Card, outcome: Outcome, tally: Tally) {
    // The first go at a card is the one that counts. Trying it again doesn't change it.
    if (results[item.id]) return;
    setResults((previous) => (previous[item.id] ? previous : { ...previous, [item.id]: outcome }));
    // Trouble on the first go puts the card in the Difficult moves deck. Failing to save it mustn't interrupt the session.
    if (isStruggle(tally)) recordStruggle(item).catch(() => {});
  }

  function next() {
    if (index + 1 >= cards.length) setEnded(true);
    else {
      setIndex(index + 1);
      setRun(0);
    }
  }

  function again() {
    setIndex(0);
    setRun(0);
    setResults({});
    setEnded(false);
    setRound((value) => value + 1);
  }

  if (ended) {
    const counts: Record<Outcome, number> = { "first-try": 0, "with-help": 0, partial: 0, shown: 0 };
    for (const outcome of Object.values(results)) counts[outcome] += 1;
    const needsLook = cards.filter((item) => results[item.id] && results[item.id] !== "first-try");
    const skipped = cards.length - done;
    return (
      <div className="max-w-2xl">
        <h2 className="text-3xl font-bold">{done === 0 ? "Session ended" : `You went through ${done === 1 ? "1 card" : `${done} cards`}`}</h2>
        {done > 0 ? (
          <ul className="mt-5 space-y-2">
            {(Object.keys(counts) as Outcome[])
              .filter((outcome) => counts[outcome] > 0)
              .map((outcome) => (
                <li key={outcome} className="flex items-baseline gap-3">
                  <span className="font-display text-2xl font-bold tabular-nums">{counts[outcome]}</span>
                  <span>{OUTCOME_LABELS[outcome]}</span>
                </li>
              ))}
          </ul>
        ) : null}
        {skipped > 0 ? <p className="mt-3 text-ink-soft">{skipped === 1 ? "1 card was" : `${skipped} cards were`} not reached.</p> : null}

        {needsLook.length > 0 ? (
          <section className="mt-8" aria-labelledby="look-again">
            <h3 id="look-again" className="font-display text-lg font-bold">
              Worth another look
            </h3>
            <ul className="mt-3 space-y-2">
              {needsLook.map((item) => (
                <li key={item.id} className="panel p-4">
                  <p className="font-semibold">{item.prompt}</p>
                  <p className="text-sm text-ink-soft">{OUTCOME_LABELS[results[item.id]]}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={again}>
            {verb} again
          </Button>
          <ButtonLink to="/decks" variant="secondary" size="lg">
            Back to decks
          </ButtonLink>
        </div>
        <p className="mt-6 text-sm text-ink-soft">
          Results aren't scheduled yet. That arrives with spaced repetition in milestone 4. Cards you struggled with are copied
          to Difficult moves.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-ink-soft" aria-live="polite">
          Card {index + 1} of {cards.length}
        </p>
        <Button variant="secondary" onClick={() => setEnded(true)}>
          End session
        </Button>
      </div>
      <div className="mt-2 h-2 rounded-full bg-line" aria-hidden="true">
        <div className="h-2 rounded-full transition-[width]" style={{ width: `${(done / cards.length) * 100}%`, background: color.from }} />
      </div>

      <div className="mt-8">
        <ReviewCard
          key={`${round}-${card.id}-${run}`}
          card={card}
          mode={run > 0 ? "review" : mode}
          replyDelay={replyDelay}
          isLast={index + 1 >= cards.length}
          onFinished={(outcome, tally) => record(card, outcome, tally)}
          onMarkDifficult={deck.theme === "difficult" ? undefined : () => markDifficult(card)}
          onNext={next}
          onAgain={() => setRun((value) => value + 1)}
        />
      </div>

      <p className="mt-10 max-w-2xl text-sm text-ink-soft">
        Cards check your move against the answer saved on the card, not an engine, so another good move can still be
        marked wrong. Results aren't scheduled yet.
      </p>
    </div>
  );
}

type Props = { replyDelay?: number };

/** /review?deck=ID plays a deck's cards one at a time. Add &mode=learn to see each answer first. */
export function ReviewPage({ replyDelay = REPLY_DELAY_MS }: Props) {
  const [params] = useSearchParams();
  const deckId = params.get("deck");
  const mode = params.get("mode") === "learn" ? "learn" : "review";
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    if (!deckId) return;
    let alive = true;
    (async () => {
      try {
        const deck = await getDeck(deckId);
        if (!alive) return;
        if (!deck) return setLoaded({ status: "missing" });
        const cards = await listCards(deckId);
        if (alive) setLoaded({ status: "ready", deck, cards });
      } catch {
        if (alive) setLoaded({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [deckId]);

  if (!deckId) return <Navigate to="/decks" replace />;

  const verb = mode === "learn" ? "Learn" : "Review";
  const title = loaded.status === "ready" ? `${verb}: ${loaded.deck.name}` : verb;

  return (
    <div>
      <Link to="/decks" className="inline-flex items-center gap-1 rounded-lg font-semibold text-ink-soft hover:text-ink">
        <ChevronLeftIcon width={20} height={20} />
        All decks
      </Link>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{title}</h1>

      <div className="mt-8">
        {loaded.status === "loading" ? <p className="text-ink-soft">Loading the cards…</p> : null}
        {loaded.status === "error" ? (
          <div className="max-w-xl">
            <Feedback tone="bad" title="Can't reach storage">
              {STORAGE_ERROR}
            </Feedback>
          </div>
        ) : null}
        {loaded.status === "missing" ? (
          <p className="max-w-xl text-lg">
            That deck isn't here any more. <Link to="/decks" className="font-semibold underline underline-offset-4">Pick another deck</Link>.
          </p>
        ) : null}
        {loaded.status === "ready" && loaded.cards.length === 0 ? (
          <p className="max-w-xl text-lg">
            This deck has no cards to {mode === "learn" ? "learn" : "review"}.{" "}
            <Link to="/create" className="font-semibold underline underline-offset-4">Make some on the Create page</Link>.
          </p>
        ) : null}
        {loaded.status === "ready" && loaded.cards.length > 0 ? (
          <Session key={`${loaded.deck.id}-${mode}`} deck={loaded.deck} cards={loaded.cards} mode={mode} replyDelay={replyDelay} />
        ) : null}
      </div>
    </div>
  );
}
