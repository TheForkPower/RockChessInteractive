import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { markDifficult, recordStruggle } from "../../data/difficult";
import { getQueue, getSettings, recentMoveTimes, recordReview } from "../../data/progress";
import { getDeck, listCards, STORAGE_ERROR } from "../../data/repo";
import type { Deck } from "../../data/db";
import type { Card } from "../../domain/cards";
import { findColor } from "../../domain/deckColors";
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

/** A card in a session, and how it is played: new cards are learned, cards that are due are reviewed. */
export type Item = { card: Card; kind: "learn" | "review" };

type Ready = {
  status: "ready";
  /** The deck being played, or null for the combined session over every deck. */
  deck: Deck | null;
  items: Item[];
  /** Saved schedules of the due cards among them. */
  schedules: Record<string, Schedule>;
  /** Every deck the cards come from, by id. */
  decks: Record<string, Deck>;
  settings: Settings;
  /** Your earlier times per move, for the time-based suggestion. */
  history: number[];
  /** Every card in scope, whether or not it is in this session. */
  total: number;
  /** When the soonest card that isn't due yet comes back, in words, e.g. "due tomorrow". */
  nextDue: string | null;
  /** New cards waiting, and how many of them today's limit lets in. */
  newWaiting: number;
  newAllowed: number;
  introduced: number;
  limit: number;
};

type Loaded = { status: "loading" } | { status: "error" } | { status: "missing" } | Ready;

const REPLY_DELAY_MS = 650;
/** A card that wasn't learned comes round again after this many other cards. */
const RETRY_GAP = 3;

type Go = {
  outcome: Outcome;
  tally: Tally;
  timing: Timing;
  playerMoves: number;
  suggestion: Suggestion;
  summary: string;
  intervals: Record<Grade, string>;
  /** For a new card: the grade it will be scheduled with if it was learned on this go. */
  learnGrade: Grade;
  learnNote: string;
};

type SessionProps = {
  items: Item[];
  /** True when grades are saved and cards are scheduled. False in practice, where nothing is saved. */
  scheduled: boolean;
  schedules: Record<string, Schedule>;
  decks: Record<string, Deck>;
  settings: Settings;
  history: number[];
  /** The colour of the progress bar. */
  accent: string;
  replyDelay: number;
  clock?: () => number;
  /** The back link and title, shown on the first line. */
  heading: ReactNode;
  /** Asks the page for the next batch. */
  onMore: () => void;
};

function Session({ items, scheduled, schedules, decks, settings, history, accent, replyDelay, clock, heading, onMore }: SessionProps) {
  const [queue, setQueue] = useState<Item[]>(items);
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [round, setRound] = useState(0);
  /** How each card went the first time. This is what the summary and the Difficult moves deck use. */
  const [results, setResults] = useState<Record<string, Go>>({});
  /** How each card went the last time it was played. */
  const [goes, setGoes] = useState<Record<string, Go>>({});
  /** How many times each new card was played and not learned. */
  const [failures, setFailures] = useState<Record<string, number>>({});
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const item = queue[index];
  const card = item.card;
  const learning = scheduled && item.kind === "learn";

  // A card counts once it has a result, or, when grades are saved, once it has been graded.
  const counted = (id: string) => (scheduled ? Boolean(grades[id]) : Boolean(results[id]));
  const done = items.filter((entry) => counted(entry.card.id)).length;

  function record(entry: Item, outcome: Outcome, tally: Tally, timing: Timing) {
    const playerMoves = playerMoveCount(entry.card);
    const suggestion = suggestGrade({ outcome, timing, playerMoves, history, useTime: settings.timeSignal });
    const preview = previewGrades(schedules[entry.card.id] ?? null, Date.now(), settings.desiredRetention);
    const intervals = Object.fromEntries(GRADES.map((grade) => [grade, formatInterval(preview[grade].days)])) as Record<Grade, string>;
    const took = timing.reliable ? ` Took ${formatDuration(timing.activeMs)}.` : "";
    const summary = `Suggested: ${GRADE_LABELS[suggestion.grade]}. ${suggestion.reason}${took}`;

    // A new card is graded for you: Good if you had it first time, Hard after one miss, Again after more.
    const missed = failures[entry.card.id] ?? 0;
    const learnGrade: Grade = missed === 0 ? "good" : missed === 1 ? "hard" : "again";
    const learnNote =
      outcome === "first-try"
        ? `Learned. It comes back in ${formatInterval(preview[learnGrade].days)}.`
        : "Not there yet. It will come round again in a few cards.";

    const go: Go = { outcome, tally, timing, playerMoves, suggestion, summary, intervals, learnGrade, learnNote };
    setGoes((previous) => ({ ...previous, [entry.card.id]: go }));
    // The first go at a card is the one that counts. Trying it again doesn't change it.
    if (results[entry.card.id]) return;
    setResults((previous) => (previous[entry.card.id] ? previous : { ...previous, [entry.card.id]: go }));
    // Trouble on the first go puts the card in the Difficult moves deck. New cards are left out: stumbling on
    // something you have only just met isn't a sign it is hard. Failing to save mustn't interrupt the session.
    if (entry.kind === "review" && isStruggle(tally)) recordStruggle(entry.card).catch(() => {});
  }

  function advance(list: Item[]) {
    if (index + 1 >= list.length) setEnded(true);
    else {
      setIndex(index + 1);
      setRun(0);
    }
  }

  async function save(input: { grade: Grade; suggested: Grade; nudged: boolean; phase: "learn" | "review"; go: Go }) {
    setSaving(true);
    setSaveError(null);
    try {
      await recordReview({
        card,
        grade: input.grade,
        suggested: input.suggested,
        nudged: input.nudged,
        phase: input.phase,
        outcome: input.go.outcome,
        tally: input.go.tally,
        playerMoves: input.go.playerMoves,
        timing: input.go.timing,
        desiredRetention: settings.desiredRetention,
      });
      setGrades((previous) => ({ ...previous, [card.id]: input.grade }));
      advance(queue);
    } catch {
      setSaveError(`That didn't save. ${STORAGE_ERROR}`);
    } finally {
      setSaving(false);
    }
  }

  async function grade(chosen: Grade) {
    const first = results[card.id];
    if (!first || saving) return;
    await save({ grade: chosen, suggested: first.suggestion.grade, nudged: first.suggestion.nudged, phase: "review", go: first });
  }

  /** A new card: schedule it if it was learned, otherwise bring it round again a few cards on. */
  async function continueLearning() {
    const go = goes[card.id];
    if (!go || saving) return;
    if (go.outcome === "first-try") {
      await save({ grade: go.learnGrade, suggested: go.learnGrade, nudged: false, phase: "learn", go });
      return;
    }
    setFailures((previous) => ({ ...previous, [card.id]: (previous[card.id] ?? 0) + 1 }));
    const at = Math.min(index + 1 + RETRY_GAP, queue.length);
    const next = [...queue.slice(0, at), item, ...queue.slice(at)];
    setQueue(next);
    advance(next);
  }

  function again() {
    setQueue(items);
    setIndex(0);
    setRun(0);
    setResults({});
    setGoes({});
    setFailures({});
    setEnded(false);
    setRound((value) => value + 1);
  }

  if (ended) {
    const reviewed = items.filter((entry) => entry.kind === "review" && counted(entry.card.id));
    const learned = items.filter((entry) => entry.kind === "learn" && counted(entry.card.id)).length;
    const counts: Record<Outcome, number> = { "first-try": 0, "with-help": 0, partial: 0, shown: 0 };
    for (const entry of reviewed) counts[results[entry.card.id].outcome] += 1;
    const needsLook = reviewed.filter((entry) => results[entry.card.id].outcome !== "first-try");
    const skipped = items.length - done;
    return (
      <div className="max-w-2xl">
        <div className="mb-8">{heading}</div>
        <h2 className="text-3xl font-bold">{done === 0 ? "Session ended" : `You went through ${done === 1 ? "1 card" : `${done} cards`}`}</h2>
        {done > 0 ? (
          <ul className="mt-5 space-y-2">
            {learned > 0 ? (
              <li className="flex items-baseline gap-3">
                <span className="font-display text-2xl font-bold tabular-nums">{learned}</span>
                <span>{learned === 1 ? "new card learned" : "new cards learned"}</span>
              </li>
            ) : null}
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
              {needsLook.map((entry) => (
                <li key={entry.card.id} className="panel p-4">
                  <p className="font-semibold">{entry.card.prompt}</p>
                  <p className="text-sm text-ink-soft">{OUTCOME_LABELS[results[entry.card.id].outcome]}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={scheduled ? onMore : again}>
            {scheduled ? "Keep going" : "Practise again"}
          </Button>
          <ButtonLink to="/decks" variant="secondary" size="lg">
            Back to decks
          </ButtonLink>
        </div>
      </div>
    );
  }

  const go = goes[card.id];
  const first = results[card.id];
  const grading =
    scheduled && !learning && first && !grades[card.id]
      ? { suggestion: first.suggestion, summary: first.summary, intervals: first.intervals, onGrade: grade, saving, error: saveError }
      : null;
  const learningProps = learning && go ? { note: go.learnNote, onContinue: continueLearning, saving, error: saveError } : null;
  const attempt = failures[card.id] ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {heading}
        <div className="flex shrink-0 items-center gap-3">
          <p className="font-semibold text-ink-soft" aria-live="polite">
            Card {index + 1} of {queue.length}
          </p>
          <Button variant="secondary" className="!px-4 !py-2" onClick={() => setEnded(true)}>
            End session
          </Button>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-line" aria-hidden="true">
        <div className="h-1.5 rounded-full transition-[width]" style={{ width: `${(done / items.length) * 100}%`, background: accent }} />
      </div>

      <div className="mt-4">
        <ReviewCard
          key={`${round}-${index}-${card.id}-${run}`}
          card={card}
          mode={item.kind === "learn" && attempt === 0 && run === 0 ? "learn" : "review"}
          replyDelay={replyDelay}
          clock={clock}
          idleMs={settings.idleSeconds * 1000}
          isLast={index + 1 >= queue.length && !(learning && go && go.outcome !== "first-try")}
          grading={grading}
          learning={learningProps}
          onFinished={(outcome, tally, timing) => record(item, outcome, tally, timing)}
          onMarkDifficult={decks[card.deckId]?.theme === "difficult" ? undefined : () => markDifficult(card)}
          onNext={() => advance(queue)}
          onAgain={() => setRun((value) => value + 1)}
        />
      </div>
    </div>
  );
}

/** What to say when nothing is waiting in a session. */
function EmptyState({ state, mode, all }: { state: Ready; mode: "learn" | "review"; all: boolean }) {
  const name = state.deck ? state.deck.name : "your decks";
  const limitReached = state.newWaiting > 0 && state.newAllowed === 0;
  const learnHref = state.deck ? `/review?deck=${state.deck.id}&mode=learn` : "/review?all=1";
  const headline =
    mode === "learn" && !all
      ? limitReached
        ? `You've learned ${state.introduced} new cards today.`
        : `No new cards in ${name}.`
      : all
        ? limitReached
          ? "Nothing is due, and you've reached today's new-card limit."
          : "Nothing is due, and there are no new cards."
        : `Nothing due in ${name}.`;
  return (
    <div className="max-w-xl">
      <p className="text-lg font-semibold">{headline}</p>
      {limitReached ? (
        <p className="mt-1 text-lg text-ink-soft">
          Your limit is {state.limit} a day. You can change it in{" "}
          <Link to="/settings" className="font-semibold underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      ) : null}
      {mode !== "learn" && !all && state.newAllowed > 0 ? (
        <p className="mt-1 text-lg text-ink-soft">
          {state.newAllowed === 1 ? "1 new card is" : `${state.newAllowed} new cards are`} ready to{" "}
          <Link to={learnHref} className="font-semibold underline underline-offset-4">
            learn
          </Link>
          .
        </p>
      ) : null}
      {state.nextDue !== null && mode !== "learn" ? <p className="mt-1 text-lg text-ink-soft">The next card is {state.nextDue}.</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {state.deck ? (
          <ButtonLink to={`/review?deck=${state.deck.id}&practice=1`} size="lg">
            Practise anyway
          </ButtonLink>
        ) : null}
        <ButtonLink to="/decks" variant={state.deck ? "secondary" : "primary"} size="lg">
          Back to decks
        </ButtonLink>
      </div>
    </div>
  );
}

type Props = { replyDelay?: number; clock?: () => number };

/**
 * /review?deck=ID reviews a deck's due cards. Add &mode=learn to learn its new cards instead.
 * /review?all=1 is the combined session: what is due in every deck, then new cards up to today's limit.
 * /review?deck=ID&practice=1 goes through every card in a deck without saving anything.
 */
export function ReviewPage({ replyDelay = REPLY_DELAY_MS, clock }: Props) {
  const [params] = useSearchParams();
  const deckId = params.get("deck");
  const all = params.get("all") === "1";
  const mode = params.get("mode") === "learn" ? "learn" : "review";
  const practice = params.get("practice") === "1" && deckId !== null;
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [batch, setBatch] = useState(0);

  useEffect(() => {
    if (!deckId && !all) return;
    let alive = true;
    (async () => {
      try {
        const deck = deckId ? await getDeck(deckId) : undefined;
        if (!alive) return;
        if (deckId && !deck) return setLoaded({ status: "missing" });
        const settings = await getSettings();
        if (practice && deckId && deck) {
          const cards = await listCards(deckId);
          const items = cards.map((card): Item => ({ card, kind: mode === "learn" ? "learn" : "review" }));
          if (alive) {
            setLoaded({
              status: "ready", deck, items, schedules: {}, decks: { [deck.id]: deck }, settings, history: [], total: cards.length,
              nextDue: null, newWaiting: 0, newAllowed: 0, introduced: 0, limit: settings.newPerDay,
            });
          }
          return;
        }
        const queue = await getQueue(all ? null : deckId);
        const history = await recentMoveTimes();
        const fresh = queue.fresh.slice(0, queue.allowance).map((card): Item => ({ card, kind: "learn" }));
        const due = queue.due.map((card): Item => ({ card, kind: "review" }));
        const items = all ? [...due, ...fresh] : mode === "learn" ? fresh : due;
        if (alive) {
          setLoaded({
            status: "ready",
            deck: deck ?? null,
            items,
            schedules: queue.schedules,
            decks: queue.decks,
            settings,
            history,
            total: queue.total,
            nextDue: queue.nextDue === null ? null : dueLabel(queue.nextDue, Date.now()).toLowerCase(),
            newWaiting: queue.fresh.length,
            newAllowed: fresh.length,
            introduced: queue.introduced,
            limit: queue.limit,
          });
        }
      } catch {
        if (alive) setLoaded({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [deckId, all, mode, practice, batch]);

  if (!deckId && !all) return <Navigate to="/decks" replace />;

  const verb = practice ? "Practise" : all ? "Learning & review" : mode === "learn" ? "Learn" : "Review";
  const title = loaded.status === "ready" && loaded.deck ? `${verb}: ${loaded.deck.name}` : verb;
  const playing = loaded.status === "ready" && loaded.items.length > 0;

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
            {all ? "You have no cards yet." : `This deck has no cards to ${mode === "learn" && !practice ? "learn" : "review"}.`}{" "}
            <Link to="/create" className="font-semibold underline underline-offset-4">Make some on the Create page</Link>.
          </p>
        ) : null}
        {loaded.status === "ready" && loaded.total > 0 && loaded.items.length === 0 ? <EmptyState state={loaded} mode={mode} all={all} /> : null}
        {loaded.status === "ready" && loaded.items.length > 0 ? (
          <Session
            key={`${deckId ?? "all"}-${mode}-${practice}-${batch}`}
            items={loaded.items}
            scheduled={!practice}
            schedules={loaded.schedules}
            decks={loaded.decks}
            settings={loaded.settings}
            history={loaded.history}
            accent={(loaded.deck ? colorOf(loaded.deck) : (findColor("ocean") as NonNullable<ReturnType<typeof findColor>>)).from}
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
