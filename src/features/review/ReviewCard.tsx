import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../../board/Board";
import { answerText, CATEGORIES, sideName, type Card } from "../../domain/cards";
import type { DifficultResult } from "../../data/difficult";
import { Game, type MoveInput } from "../../domain/game";
import { moveLabel, parseMovetext } from "../../domain/pgn";
import { answerNodeIds, linkMoves } from "../../domain/richText";
import { backText, judgeMove, outcomeOf, planCard, splitPrompt, type Outcome, type Tally } from "../../domain/review";
import { GRADES, type Grade, type Suggestion } from "../../domain/scheduling";
import { DEFAULT_IDLE_MS, ResponseTimer, type Timing } from "../../domain/timing";
import { ContinuationViewer } from "../../moves/ContinuationViewer";
import { LinkedText, MoveButton } from "../../moves/LinkedText";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { GradeButton } from "../../ui/GradeButton";

type Phase = "study" | "play" | "back";
type Message = { tone: "good" | "bad" | "info"; title: string; body?: string } | null;

/** What the card needs to ask for a grade once the answer is out. */
export type Grading = {
  suggestion: Suggestion;
  /** The suggestion in words, shown beside the buttons. */
  summary: string;
  /** How long until the card returns for each grade, e.g. "3 days". */
  intervals: Record<Grade, string>;
  onGrade: (grade: Grade) => void;
  /** True while a grade is being saved. */
  saving: boolean;
  /** Set when saving the grade failed. */
  error: string | null;
};

export type ReviewCardProps = {
  card: Card;
  /** "review" starts by asking the question. "learn" shows the answer first, then asks it. */
  mode: "review" | "learn";
  /** How long the opponent's reply takes to appear, in milliseconds. */
  replyDelay: number;
  isLast: boolean;
  /** Called once, when the card ends, with how it went and how long it took. */
  onFinished: (outcome: Outcome, tally: Tally, timing: Timing) => void;
  /** Asks for Again, Hard, Good or Easy after the answer. Leave out in practice, where nothing is scheduled. */
  grading?: Grading | null;
  /** Reads the clock, in milliseconds. Tests pass their own. */
  clock?: () => number;
  /** A pause longer than this stops counting as thinking time. */
  idleMs?: number;
  onNext: () => void;
  onAgain: () => void;
  /** Adds this card to the Difficult moves deck. Leave out where the card can't be added (it is already there). */
  onMarkDifficult?: () => Promise<DifficultResult>;
};

function resultMessage(outcome: Outcome, played: number, alternative: string | null): Message {
  switch (outcome) {
    case "first-try":
      return alternative
        ? { tone: "good", title: "Correct", body: `${alternative} is saved on this card as another accepted move.` }
        : { tone: "good", title: "Correct" };
    case "with-help":
      return { tone: "info", title: "You found it", body: "It took a hint or a second try, so look the moves over before you go on." };
    case "partial":
      return {
        tone: "info",
        title: "Part of it right",
        body: `${played === 1 ? "Your first move was" : `Your first ${played} moves were`} right. Here is the whole line.`,
      };
    default:
      return { tone: "info", title: "Here's the answer" };
  }
}

/** One card: the question on the board, then the answer, explanation and moves. */
export function ReviewCard({
  card,
  mode,
  replyDelay,
  isLast,
  onFinished,
  grading,
  clock = Date.now,
  idleMs = DEFAULT_IDLE_MS,
  onNext,
  onAgain,
  onMarkDifficult,
}: ReviewCardProps) {
  const plan = useMemo(() => planCard(card), [card]);
  const opponentFirst = plan[0]?.mover === "opponent";

  const tree = useMemo(() => {
    const parsed = parseMovetext(backText(card), card.fen);
    return parsed.ok ? parsed.tree : null;
  }, [card]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [marked, setMarked] = useState<"idle" | "added" | "already" | "failed">("idle");

  async function markDifficult() {
    if (!onMarkDifficult) return;
    try {
      setMarked((await onMarkDifficult()) === "already" ? "already" : "added");
    } catch {
      setMarked("failed");
    }
  }

  const [game] = useState(() => new Game(card.fen));
  const [fen, setFen] = useState(card.fen);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [phase, setPhase] = useState<Phase>(mode === "learn" ? "study" : "play");
  const [step, setStep] = useState(0);
  const [waiting, setWaiting] = useState(mode === "review" && opponentFirst);
  const [hintShown, setHintShown] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState<Message>(
    mode === "learn"
      ? { tone: "info", title: "Study this card", body: "Look at the moves and the explanation. When you're ready, play them from memory." }
      : null,
  );
  const tally = useRef<Tally>({ mistakes: 0, hintUsed: false, revealed: false, played: 0 });
  const timer = useRef<number | null>(null);
  // Response time starts when the question appears. In learn mode that is when you start playing, not while you study.
  const responseTimer = useRef<ResponseTimer | null>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  function startResponseTimer() {
    responseTimer.current = new ResponseTimer(clockRef.current(), idleMs);
  }

  function finish(alternative: string | null = null) {
    clearTimer();
    if (!responseTimer.current) startResponseTimer();
    const timing = (responseTimer.current as ResponseTimer).complete(clockRef.current());
    const outcome = outcomeOf(tally.current);
    setWaiting(false);
    setHintShown(false);
    setPhase("back");
    setMessage(resultMessage(outcome, tally.current.played, alternative));
    onFinished(outcome, { ...tally.current }, timing);
  }

  function playOpponent(index: number) {
    const { move } = plan[index];
    game.move({ from: move.from, to: move.to, promotion: move.promotion });
    setFen(game.fen);
    setLastMove({ from: move.from, to: move.to });
    setWaiting(false);
    proceed(index + 1);
  }

  function proceed(next: number) {
    if (next >= plan.length) return finish();
    if (plan[next].mover === "opponent") {
      setWaiting(true);
      timer.current = window.setTimeout(() => playOpponent(next), replyDelay);
      return;
    }
    setStep(next);
    if (next > 0) setMessage({ tone: "info", title: "Now find the next move" });
  }

  // The clock starts as the question appears, and signs of life keep it honest: a pause longer than the idle limit,
  // or time with the tab hidden, doesn't count as thinking.
  useEffect(() => {
    if (mode === "review") startResponseTimer();
    const touch = () => responseTimer.current?.activity(clockRef.current());
    const visibility = () => {
      if (document.visibilityState === "hidden") responseTimer.current?.hide(clockRef.current());
      else responseTimer.current?.show(clockRef.current());
    };
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
    for (const name of events) window.addEventListener(name, touch, { capture: true, passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      for (const name of events) window.removeEventListener(name, touch, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
    };
    // Runs once for this card. The timer and clock are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Review mode with the opponent to move first: their move appears on its own.
  useEffect(() => {
    if (mode !== "review" || !opponentFirst) return;
    timer.current = window.setTimeout(() => playOpponent(0), replyDelay);
    return clearTimer;
    // Runs once for this card. playOpponent only reads values that never change for a card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPlaying() {
    startResponseTimer();
    setPhase("play");
    setMessage(null);
    if (opponentFirst) {
      setWaiting(true);
      timer.current = window.setTimeout(() => playOpponent(0), replyDelay);
    }
  }

  function handleMove(input: MoveInput): boolean {
    if (phase !== "play" || waiting) return false;
    responseTimer.current?.firstMove(clockRef.current());
    const verdict = judgeMove(card, step, input);
    setAttempts((n) => n + 1);
    if (verdict === "wrong") {
      tally.current.mistakes += 1;
      setMessage({
        tone: "bad",
        title: "Not quite",
        body:
          step === 0
            ? "That isn't the move on this card. Try again."
            : "The moves so far are right, but that isn't the next one. Try again.",
      });
      return false;
    }
    const played = game.move(input);
    if (!played) return false;
    tally.current.played += 1;
    setFen(game.fen);
    setLastMove({ from: input.from, to: input.to });
    setHintShown(false);
    if (verdict === "alternative") {
      finish(played.san);
      return true;
    }
    if (step + 1 < plan.length) setMessage({ tone: "good", title: "Correct" });
    proceed(step + 1);
    return true;
  }

  function toggleHint() {
    if (!hintShown) tally.current.hintUsed = true;
    setHintShown((shown) => !shown);
  }

  function showAnswer() {
    tally.current.revealed = true;
    finish();
  }

  useEffect(() => clearTimer, []);

  const canAct = phase === "play" && !waiting;
  const category = CATEGORIES.find((option) => option.value === card.category)?.label ?? card.category;
  const answer = answerText(card.fen, card.answer);
  const { heading, detail } = splitPrompt(card);
  const answerIds = answerNodeIds(tree, card.answer);
  const explanation = useMemo(() => linkMoves(card.explanation, tree), [card.explanation, tree]);

  /** The moves of the answer, each one pressable. Falls back to plain text if the saved continuation doesn't start with them. */
  function answerMoves() {
    if (!tree || !answerIds) return <span className="font-mono">{answer}</span>;
    return (
      <span className="text-lg">
        {answerIds.map((id, index) => {
          const node = tree.nodes[id];
          const before = tree.nodes[node.parentId as string].fen.split(" ");
          const prefix = before[1] === "w" ? `${before[5]}.` : index === 0 ? `${before[5]}...` : "";
          return (
            <span key={id} className="whitespace-nowrap">
              {prefix ? <span className="text-ink-soft">{prefix} </span> : null}
              <MoveButton selected={id === shownId} label={moveLabel(tree, id)} onClick={() => setShownId(id)}>
                {node.san ?? ""}
              </MoveButton>{" "}
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="w-[clamp(18rem,calc(100svh_-_10.5rem),34rem)] max-w-full">
        {phase === "play" ? (
          <Board
            fen={fen}
            orientation={card.side}
            interactive={canAct ? "turn" : false}
            onMove={handleMove}
            lastMove={lastMove}
            label={`Chessboard. ${card.prompt}`}
          />
        ) : (
          <ContinuationViewer
            fen={card.fen}
            continuation={backText(card)}
            orientation={card.side}
            selectedId={shownId}
            onSelect={setShownId}
            showMoves={false}
          />
        )}
      </div>

      <div className="min-w-0 lg:max-h-[calc(100svh_-_10.5rem)] lg:overflow-y-auto lg:pr-2">
        <p className="text-sm font-semibold text-ink-soft">
          {category}. You play {sideName(card.side)}.
        </p>
        <h2 className="mt-1 text-4xl font-bold">{heading}</h2>
        {detail ? <p className="mt-2 text-lg text-ink-soft">{detail}</p> : null}

        <div className="mt-4 min-h-16" aria-live="polite">
          {message ? (
            <Feedback tone={message.tone} title={message.title}>
              {message.body}
            </Feedback>
          ) : (
            <p className="text-ink-soft">{waiting ? "Your opponent is moving…" : "Play your answer on the board."}</p>
          )}
          {hintShown && canAct ? (
            <p className="mt-3">
              <span className="font-semibold">Hint:</span> {card.hint}
            </p>
          ) : null}
        </div>

        {phase === "play" ? (
          <div className="mt-5">
            <div className="flex flex-wrap gap-3">
              {card.hint.trim() !== "" ? (
                <Button variant="secondary" disabled={!canAct} onClick={toggleHint}>
                  {hintShown ? "Hide hint" : "Hint"}
                </Button>
              ) : null}
              <Button variant="secondary" disabled={!canAct || attempts === 0} aria-describedby="answer-note" onClick={showAnswer}>
                Show answer
              </Button>
            </div>
            {attempts === 0 ? (
              <p id="answer-note" className="mt-2 text-sm text-ink-soft">
                Make a move first. Then you can ask to see the answer.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {phase === "back" && grading ? (
              <div>
                <p id="grade-summary" className="mb-4">
                  {grading.summary}
                </p>
                <div role="group" aria-label="How did it go?" aria-describedby="grade-summary" className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
                  {GRADES.map((grade) => (
                    <GradeButton
                      key={grade}
                      grade={grade}
                      interval={grading.intervals[grade]}
                      suggested={grade === grading.suggestion.grade}
                      disabled={grading.saving}
                      onSelect={grading.onGrade}
                    />
                  ))}
                </div>
                {grading.error ? (
                  <p role="alert" className="mt-3 font-semibold text-bad-edge">
                    {grading.error}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {phase === "study" ? (
                <Button onClick={startPlaying}>
                  Play it from memory
                </Button>
              ) : (
                <>
                  {grading ? null : (
                    <Button onClick={onNext}>
                      {isLast ? "See results" : "Next card"}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={onAgain}>
                    Try this card again
                  </Button>
                  {onMarkDifficult ? (
                    <Button variant="secondary" disabled={marked === "added" || marked === "already"} onClick={markDifficult}>
                      Mark as difficult
                    </Button>
                  ) : null}
                </>
              )}
            </div>
            {marked !== "idle" ? (
              <p role="status" className="text-sm font-semibold text-ink-soft">
                {marked === "added"
                  ? "Added to Difficult moves."
                  : marked === "already"
                    ? "Already in Difficult moves."
                    : "That didn't save. Storage may be blocked in this browser."}
              </p>
            ) : null}

            <section aria-labelledby="answer-heading">
              <h3 id="answer-heading" className="text-sm font-semibold text-ink-soft">
                {phase === "study" ? (card.kind === "move" ? "The move" : "The line") : card.kind === "move" ? "Answer" : "Answer line"}
              </h3>
              <p className="mt-1">{answerMoves()}</p>
              {phase === "back" && card.alternatives.length > 0 ? (
                <p className="mt-1 text-sm text-ink-soft">
                  Also accepted: <span className="font-mono">{card.alternatives.map((move) => move.san).join(", ")}</span>
                </p>
              ) : null}
            </section>

            {card.explanation ? (
              <section aria-labelledby="why-heading">
                <h3 id="why-heading" className="text-sm font-semibold text-ink-soft">
                  Why
                </h3>
                <div className="mt-1">
                  <LinkedText pieces={explanation} selectedId={shownId} onSelect={setShownId} />
                </div>
              </section>
            ) : null}

            {phase === "back" && card.notes ? (
              <section>
                <h3 className="text-sm font-semibold text-ink-soft">Notes</h3>
                <p className="mt-1 whitespace-pre-wrap">{card.notes}</p>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
