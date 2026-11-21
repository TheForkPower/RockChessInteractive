import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../../board/Board";
import { answerText, CATEGORIES, sideName, type Card } from "../../domain/cards";
import { Game, type MoveInput } from "../../domain/game";
import { backText, judgeMove, outcomeOf, planCard, type Outcome, type Tally } from "../../domain/review";
import { ContinuationViewer } from "../../moves/ContinuationViewer";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";

type Phase = "study" | "play" | "back";
type Message = { tone: "good" | "bad" | "info"; title: string; body?: string } | null;

export type ReviewCardProps = {
  card: Card;
  /** "review" starts by asking the question. "learn" shows the answer first, then asks it. */
  mode: "review" | "learn";
  /** How long the opponent's reply takes to appear, in milliseconds. */
  replyDelay: number;
  isLast: boolean;
  /** Called once, when the card ends, with how it went. */
  onFinished: (outcome: Outcome) => void;
  onNext: () => void;
  onAgain: () => void;
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
export function ReviewCard({ card, mode, replyDelay, isLast, onFinished, onNext, onAgain }: ReviewCardProps) {
  const plan = useMemo(() => planCard(card), [card]);
  const opponentFirst = plan[0]?.mover === "opponent";

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

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  function finish(alternative: string | null = null) {
    clearTimer();
    const outcome = outcomeOf(tally.current);
    setWaiting(false);
    setHintShown(false);
    setPhase("back");
    setMessage(resultMessage(outcome, tally.current.played, alternative));
    onFinished(outcome);
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

  // Review mode with the opponent to move first: their move appears on its own.
  useEffect(() => {
    if (mode !== "review" || !opponentFirst) return;
    timer.current = window.setTimeout(() => playOpponent(0), replyDelay);
    return clearTimer;
    // Runs once for this card. playOpponent only reads values that never change for a card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPlaying() {
    setPhase("play");
    setMessage(null);
    if (opponentFirst) {
      setWaiting(true);
      timer.current = window.setTimeout(() => playOpponent(0), replyDelay);
    }
  }

  function handleMove(input: MoveInput): boolean {
    if (phase !== "play" || waiting) return false;
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

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start">
      <div className="w-[clamp(18rem,calc(100svh_-_13rem),34rem)] max-w-full">
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
          <ContinuationViewer fen={card.fen} continuation={backText(card)} orientation={card.side} />
        )}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-soft">
          {category}. You play {sideName(card.side)}.
        </p>
        <h2 className="mt-2 text-3xl font-bold">{card.prompt}</h2>

        <div className="mt-5 min-h-24" aria-live="polite">
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
        ) : null}

        {phase !== "play" ? (
          <div className="mt-6 space-y-5">
            {phase === "back" ? (
              <>
                <section>
                  <h3 className="text-sm font-semibold text-ink-soft">{card.kind === "move" ? "Answer" : "Answer line"}</h3>
                  <p className="mt-1 font-mono text-lg">{answer}</p>
                  {card.alternatives.length > 0 ? (
                    <p className="mt-1 text-sm text-ink-soft">
                      Also accepted: <span className="font-mono">{card.alternatives.map((move) => move.san).join(", ")}</span>
                    </p>
                  ) : null}
                </section>
                {card.explanation ? (
                  <section>
                    <h3 className="text-sm font-semibold text-ink-soft">Why</h3>
                    <p className="mt-1 whitespace-pre-wrap">{card.explanation}</p>
                  </section>
                ) : null}
                {card.notes ? (
                  <section>
                    <h3 className="text-sm font-semibold text-ink-soft">Notes</h3>
                    <p className="mt-1 whitespace-pre-wrap">{card.notes}</p>
                  </section>
                ) : null}
              </>
            ) : (
              <>
                <section>
                  <h3 className="text-sm font-semibold text-ink-soft">{card.kind === "move" ? "The move" : "The line"}</h3>
                  <p className="mt-1 font-mono text-lg">{answer}</p>
                </section>
                {card.explanation ? (
                  <section>
                    <h3 className="text-sm font-semibold text-ink-soft">Why</h3>
                    <p className="mt-1 whitespace-pre-wrap">{card.explanation}</p>
                  </section>
                ) : null}
              </>
            )}

            <div className="flex flex-wrap gap-3">
              {phase === "study" ? (
                <Button size="lg" onClick={startPlaying}>
                  Play it from memory
                </Button>
              ) : (
                <>
                  <Button size="lg" onClick={onNext}>
                    {isLast ? "See results" : "Next card"}
                  </Button>
                  <Button variant="secondary" size="lg" onClick={onAgain}>
                    Try this card again
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
