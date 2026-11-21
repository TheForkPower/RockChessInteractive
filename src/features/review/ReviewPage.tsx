import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { markDifficult, recordStruggle } from "../../data/difficult";
import { getQueue, getSettings, NEW_PER_SESSION, recentMoveTimes, recordReview } from "../../data/progress";
import { getDeck, listCards, STORAGE_ERROR } from "../../data/repo";
import type { Deck } from "../../data/db";
import type { Card } from "../../domain/cards";
import { colorOf } from "../../domain/deckColors";
import { isStruggle, OUTCOME_LABELS, playerMoveCount, type Outcome, type Tally } from "../../domain/review";
import {
  dueLabel,
  formatInterval,
  GRADE_LABELS,
  GRADES,
  previewGrades,
  suggestGrade,
  type Grade,
  type Schedule,
  type Suggestion,
} from "../../domain/scheduling";
import type { Settings } from "../../domain/settings";
import { formatDuration, type Timing } from "../../domain/timing";
import { Button, ButtonLink } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { ChevronLeftIcon } from "../../ui/Icons";
import { ReviewCard } from "./ReviewCard";

type Ready = {
  status: "ready";
  deck: Deck;
  /** The cards for this session, in order. */
  cards: Card[];
  /** Saved schedules of the due cards among them. */
  schedules: Record<string, Schedule>;
  settings: Settings;
  /** Your earlier times per move, for the time-based suggestion. */
  history: number[];
  /** Every card in the deck, whether or not it is in this session. */
  total: number;
  /** When the soonest card that isn't due yet comes back, in words, e.g. "due tomorrow". */
  nextDue: string | null;
};

type Loaded = { status: "loading" } | { status: "error" } | { status: "missing" } | Ready;

const REPLY_DELAY_MS = 650;

type FirstGo = {
  outcome: Outcome;
  tally: Tally;
  timing: Timing;
  playerMoves: number;
  suggestion: Suggestion;
  summary: string;
  intervals: Record<Grade, string>;
};

type SessionProps = {
  deck: Deck;
  cards: Card[];
  mode: "review" | "learn";
  /** True when grades are saved and cards are scheduled. False in practice, where nothing is saved. */
  scheduled: boolean;
  schedules: Record<string, Schedule>;
  settings: Settings;
  history: number[];
  replyDelay: number;
  clock?: () => number;
  /** The back link and title, shown on the first line. */
  heading: ReactNode;
  /** Asks the page for the next batch. */
  onMore: () => void;
};

function Session({ deck, cards, mode, scheduled, schedules, settings, history, replyDelay, clock, heading, onMore }: SessionProps) {
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<Record<string, FirstGo>>({});
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const color = colorOf(deck);
  const verb = scheduled ? (mode === "learn" ? "Learn" : "Review") : "Practise";

  // A card counts once it has a result, or, when grades are saved, once it has been graded.
  const counted = (id: string) => (scheduled ? Boolean(grades[id]) : Boolean(results[id]));
  const done = cards.filter((item) => counted(item.id)).length;
  const card = cards[index];

  function record(item: Card, outcome: Outcome, tally: Tally, timing: Timing) {
    // The first go at a card is the one that counts. Trying it again doesn't change it.
    if (results[item.id]) return;
    const playerMoves = playerMoveCount(item);
    const suggestion = suggestGrade({ outcome, timing, playerMoves, history, useTime: settings.timeSignal });
    const preview = previewGrades(schedules[item.id] ?? null, Date.now(), settings.desiredRetention);
    const intervals = Object.fromEntries(GRADES.map((grade) => [grade, formatInterval(preview[grade].days)])) as Record<Grade, string>;
    const took = timing.reliable ? ` Took ${formatDuration(timing.activeMs)}.` : "";
    const summary = `Suggested: ${GRADE_LABELS[suggestion.grade]}. ${suggestion.reason}${took}`;
    setResults((previous) =>
      previous[item.id] ? previous : { ...previous, [item.id]: { outcome, tally, timing, playerMoves, suggestion, summary, intervals } },
    );
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

  async function grade(chosen: Grade) {
    const first = results[card.id];
    if (!first || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await recordReview({
        card,
        grade: chosen,
        suggested: first.suggestion.grade,
        nudged: first.suggestion.nudged,
        outcome: first.outcome,
        tally: first.tally,
        playerMoves: first.playerMoves,
        timing: first.timing,
        desiredRetention: settings.desiredRetention,
      });
      setGrades((previous) => ({ ...previous, [card.id]: chosen }));
      next();
    } catch {
      setSaveError(`That grade didn't save. ${STORAGE_ERROR}`);
    } finally {
      setSaving(false);
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
    for (const item of cards) if (counted(item.id)) counts[results[item.id].outcome] += 1;
    const needsLook = cards.filter((item) => counted(item.id) && results[item.id].outcome !== "first-try");
    const skipped = cards.length - done;
    return (
      <div className="max-w-2xl">
        <div className="mb-8">{heading}</div>
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
                  <p className="text-sm text-ink-soft">{OUTCOME_LABELS[results[item.id].outcome]}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={scheduled ? onMore : again}>
            {scheduled ? `${verb} more` : `${verb} again`}
          </Button>
          <ButtonLink to="/decks" variant="secondary" size="lg">
            Back to decks
          </ButtonLink>
        </div>
      </div>
    );
  }

  const first = results[card.id];
  const grading =
    scheduled && first && !grades[card.id]
      ? { suggestion: first.suggestion, summary: first.summary, intervals: first.intervals, onGrade: grade, saving, error: saveError }
      : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {heading}
        <div className="flex shrink-0 items-center gap-3">
          <p className="font-semibold text-ink-soft" aria-live="polite">
            Card {index + 1} of {cards.length}
          </p>
          <Button variant="secondary" className="!px-4 !py-2" onClick={() => setEnded(true)}>
            End session
          </Button>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-line" aria-hidden="true">
        <div className="h-1.5 rounded-full transition-[width]" style={{ width: `${(done / cards.length) * 100}%`, background: color.from }} />
      </div>

      <div className="mt-4">
        <ReviewCard
          key={`${round}-${card.id}-${run}`}
          card={card}
          mode={run > 0 ? "review" : mode}
          replyDelay={replyDelay}
          clock={clock}
          idleMs={settings.idleSeconds * 1000}
          isLast={index + 1 >= cards.length}
          grading={grading}
          onFinished={(outcome, tally, timing) => record(card, outcome, tally, timing)}
          onMarkDifficult={deck.theme === "difficult" ? undefined : () => markDifficult(card)}
          onNext={next}
          onAgain={() => setRun((value) => value + 1)}
        />
      </div>
    </div>
  );
}

type Props = { replyDelay?: number; clock?: () => number };

/**
 * /review?deck=ID goes through what is due, then some new cards, and saves a grade for each.
 * Add &mode=learn to meet only new cards, each with its answer first.
 * Add &practice=1 to go through every card without saving anything.
 */
export function ReviewPage({ replyDelay = REPLY_DELAY_MS, clock }: Props) {
  const [params] = useSearchParams();
  const deckId = params.get("deck");
  const mode = params.get("mode") === "learn" ? "learn" : "review";
  const practice = params.get("practice") === "1";
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [batch, setBatch] = useState(0);

  useEffect(() => {
    if (!deckId) return;
    let alive = true;
    (async () => {
      try {
        const deck = await getDeck(deckId);
        if (!alive) return;
        if (!deck) return setLoaded({ status: "missing" });
        const settings = await getSettings();
        if (practice) {
          const cards = await listCards(deckId);
          if (alive) setLoaded({ status: "ready", deck, cards, schedules: {}, settings, history: [], total: cards.length, nextDue: null });
          return;
        }
        const queue = await getQueue(deckId);
        const history = await recentMoveTimes();
        const fresh = queue.fresh.slice(0, NEW_PER_SESSION);
        const cards = mode === "learn" ? fresh : [...queue.due, ...fresh];
        if (alive) setLoaded({ status: "ready", deck, cards, schedules: queue.schedules, settings, history, total: queue.total, nextDue: queue.nextDue === null ? null : dueLabel(queue.nextDue, Date.now()).toLowerCase() });
      } catch {
        if (alive) setLoaded({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [deckId, mode, practice, batch]);

  if (!deckId) return <Navigate to="/decks" replace />;

  const verb = practice ? "Practise" : mode === "learn" ? "Learn" : "Review";
  const title = loaded.status === "ready" ? `${verb}: ${loaded.deck.name}` : verb;
  const playing = loaded.status === "ready" && loaded.cards.length > 0;

  const heading = (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        to="/decks"
        aria-label="All decks"
        className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-line/60 hover:text-ink"
      >
        <ChevronLeftIcon width={22} height={22} />
      </Link>
      <h1 className="truncate text-2xl font-bold">{title}</h1>
    </div>
  );

  return (
    <div>
      {playing ? null : heading}

      <div className={playing ? "" : "mt-8"}>
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
        {loaded.status === "ready" && loaded.total === 0 ? (
          <p className="max-w-xl text-lg">
            This deck has no cards to {mode === "learn" && !practice ? "learn" : "review"}.{" "}
            <Link to="/create" className="font-semibold underline underline-offset-4">Make some on the Create page</Link>.
          </p>
        ) : null}
        {loaded.status === "ready" && loaded.total > 0 && loaded.cards.length === 0 ? (
          <div className="max-w-xl">
            <p className="text-lg font-semibold">{mode === "learn" ? `No new cards in ${loaded.deck.name}.` : `Nothing due in ${loaded.deck.name}.`}</p>
            {loaded.nextDue !== null ? (
              <p className="mt-1 text-lg text-ink-soft">The next card is {loaded.nextDue}.</p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink to={`/review?deck=${loaded.deck.id}&practice=1`} size="lg">
                Practise anyway
              </ButtonLink>
              <ButtonLink to="/decks" variant="secondary" size="lg">
                Back to decks
              </ButtonLink>
            </div>
          </div>
        ) : null}
        {loaded.status === "ready" && loaded.cards.length > 0 ? (
          <Session
            key={`${loaded.deck.id}-${mode}-${practice}-${batch}`}
            deck={loaded.deck}
            cards={loaded.cards}
            mode={mode}
            scheduled={!practice}
            schedules={loaded.schedules}
            settings={loaded.settings}
            history={loaded.history}
            replyDelay={replyDelay}
            clock={clock}
            heading={heading}
            onMore={() => {
              setLoaded({ status: "loading" });
              setBatch((value) => value + 1);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
