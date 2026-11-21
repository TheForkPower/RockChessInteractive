import { useEffect, useRef, useState } from "react";
import { Board } from "../../board/Board";
import { Game, type MoveInput } from "../../domain/game";
import { isCorrectAnswer, type PracticeCard as Card } from "../../domain/practice";
import { practiceCards } from "../../domain/practiceCards";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";

type Message = { tone: "good" | "bad" | "info"; title: string; body?: string } | null;

const REPLY_DELAY_MS = 650;

type CardViewProps = {
  card: Card;
  position: number;
  total: number;
  onNext: () => void;
  onRestart: () => void;
};

function PracticeCardView({ card, position, total, onNext, onRestart }: CardViewProps) {
  const [game] = useState(() => new Game(card.startFen));
  const [fen, setFen] = useState(card.startFen);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [step, setStep] = useState(0); // index in card.line of the move you play next
  const [wrongTries, setWrongTries] = useState(0);
  const [waiting, setWaiting] = useState(false); // the opponent is replying
  const [done, setDone] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const answerShown = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function finish() {
    setDone(true);
    setMessage({
      tone: answerShown.current ? "info" : "good",
      title: answerShown.current ? "Here's how it goes" : "Correct",
      body: card.explanation,
    });
  }

  function play(move: MoveInput) {
    game.move(move);
    setFen(game.fen);
    setLastMove({ from: move.from, to: move.to });
    setWrongTries(0);
    setShowHint(false);

    const replyIndex = step + 1;
    if (replyIndex >= card.line.length) return finish();

    setWaiting(true);
    setMessage(answerShown.current ? { tone: "info", title: "Here's the move" } : { tone: "good", title: "Correct" });
    timer.current = window.setTimeout(() => {
      const reply = card.line[replyIndex];
      game.move({ from: reply.from, to: reply.to, promotion: reply.promotion as MoveInput["promotion"] });
      setFen(game.fen);
      setLastMove({ from: reply.from, to: reply.to });
      setWaiting(false);
      if (replyIndex + 1 >= card.line.length) return finish();
      setStep(replyIndex + 1);
      setMessage({ tone: answerShown.current ? "info" : "good", title: "Now find the next move" });
    }, REPLY_DELAY_MS);
  }

  function handleMove(move: MoveInput): boolean {
    if (done || waiting) return false;
    if (!isCorrectAnswer(card, step, game.fen, move)) {
      setWrongTries((n) => n + 1);
      setMessage({ tone: "bad", title: "Not quite", body: "That isn't the move. Try again." });
      return false;
    }
    play(move);
    return true;
  }

  function showAnswer() {
    const expected = card.line[step];
    answerShown.current = true;
    play({ from: expected.from, to: expected.to, promotion: expected.promotion as MoveInput["promotion"] });
  }

  const canAct = !done && !waiting;

  return (
    <section className="panel p-5" aria-labelledby="practice-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="practice-title" className="text-xl font-bold">
          {card.title}
        </h2>
        <p className="shrink-0 text-sm text-ink-soft">
          Practice card {position} of {total}
        </p>
      </div>
      <p className="text-sm text-ink-soft">{card.source}</p>
      <p className="mt-2 font-semibold">{card.instruction}</p>

      {/* The board shrinks on short windows so the whole card stays on one screen. */}
      <div className="mx-auto mt-3 w-[clamp(16rem,calc(100svh_-_29rem),27.5rem)] max-w-full">
        <Board
          fen={fen}
          orientation="w"
          interactive={canAct ? "turn" : false}
          onMove={handleMove}
          lastMove={lastMove}
          label={`Chessboard. ${card.instruction}`}
        />
      </div>

      <div className="mt-3 h-28 overflow-y-auto" aria-live="polite">
        {message ? (
          <Feedback compact tone={message.tone} title={message.title}>
            {message.body}
          </Feedback>
        ) : (
          <p className="text-sm text-ink-soft">Move a piece on the board to answer.</p>
        )}
        {showHint && canAct ? <p className="mt-2 text-sm text-ink-soft">Hint: {card.hint}</p> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {done ? (
          <>
            <Button onClick={onNext}>Next card</Button>
            <Button variant="secondary" onClick={onRestart}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" disabled={!canAct} onClick={() => setShowHint((shown) => !shown)}>
              {showHint ? "Hide hint" : "Hint"}
            </Button>
            <Button variant="secondary" disabled={!canAct || wrongTries < 2} onClick={showAnswer}>
              Show answer
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export function PracticeCards() {
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const card = practiceCards[index];
  return (
    <PracticeCardView
      key={`${card.id}-${run}`}
      card={card}
      position={index + 1}
      total={practiceCards.length}
      onNext={() => {
        setIndex((i) => (i + 1) % practiceCards.length);
        setRun(0);
      }}
      onRestart={() => setRun((r) => r + 1)}
    />
  );
}
