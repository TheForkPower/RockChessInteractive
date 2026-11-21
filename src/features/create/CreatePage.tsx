import { useState, type FormEvent } from "react";
import type { BoardColor } from "cm-chessboard/src/Chessboard.js";
import { Board } from "../../board/Board";
import { parseFen, START_FEN } from "../../domain/fen";
import { Game, describeStatus, type MoveInput } from "../../domain/game";
import { formatMoveList } from "../../domain/moveList";
import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";

const fieldClass =
  "w-full rounded-2xl border-2 border-line-strong bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 aria-[invalid=true]:border-bad";

export function CreatePage() {
  const [game, setGame] = useState(() => new Game());
  const [, setVersion] = useState(0); // bumped after moves, because Game changes in place
  const [orientation, setOrientation] = useState<BoardColor>("w");
  const [fenDraft, setFenDraft] = useState(START_FEN);
  const [fenError, setFenError] = useState<string | null>(null);
  const [moveDraft, setMoveDraft] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);

  const moves = game.history();
  const lastMove = game.lastMove();

  function afterMove() {
    setVersion((v) => v + 1);
    setFenDraft(game.fen);
    setFenError(null);
    setMoveError(null);
  }

  function handleBoardMove(move: MoveInput): boolean {
    if (!game.move(move)) return false;
    afterMove();
    return true;
  }

  function loadFen(fen: string) {
    setGame(new Game(fen));
    setFenDraft(fen);
    setFenError(null);
    setMoveError(null);
    setMoveDraft("");
  }

  function submitFen(event: FormEvent) {
    event.preventDefault();
    const parsed = parseFen(fenDraft);
    if (!parsed.ok) return setFenError(parsed.error);
    loadFen(parsed.fen);
  }

  function submitMove(event: FormEvent) {
    event.preventDefault();
    const text = moveDraft.trim();
    if (!text) return setMoveError("Type a move, such as Nf3 or e4.");
    if (!game.moveSan(text)) return setMoveError(`${text} isn't a legal move in this position.`);
    setMoveDraft("");
    afterMove();
  }

  function undo() {
    if (!game.undo()) return;
    afterMove();
  }

  return (
    <div>
      <PageHeader title="Create a card">
        Set up a position by pasting a FEN or playing moves on the board. Saving it as a card arrives in milestone 2.
      </PageHeader>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <div>
          <Board
            fen={game.fen}
            orientation={orientation}
            interactive="turn"
            onMove={handleBoardMove}
            lastMove={lastMove}
            label={`Chessboard. ${describeStatus(game)}`}
          />
          <p className="mt-3 text-lg font-semibold" aria-live="polite">
            {describeStatus(game)}
          </p>
        </div>

        <div className="space-y-8">
          <form onSubmit={submitFen} noValidate>
            <label htmlFor="fen" className="block font-display text-lg font-bold">
              FEN
            </label>
            <p id="fen-help" className="mt-1 text-sm text-ink-soft">
              Paste a position, or play moves and this updates.
            </p>
            <input
              id="fen"
              type="text"
              value={fenDraft}
              onChange={(event) => setFenDraft(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-invalid={fenError ? true : undefined}
              aria-describedby={fenError ? "fen-help fen-error" : "fen-help"}
              className={`${fieldClass} mt-3 font-mono text-sm`}
            />
            {fenError ? (
              <p id="fen-error" role="alert" className="mt-2 font-semibold text-bad-edge">
                {fenError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit">Set position</Button>
              <Button variant="secondary" onClick={() => loadFen(START_FEN)}>
                Start position
              </Button>
            </div>
          </form>

          <form onSubmit={submitMove} noValidate>
            <label htmlFor="move" className="block font-display text-lg font-bold">
              Play a move
            </label>
            <p id="move-help" className="mt-1 text-sm text-ink-soft">
              Type it in algebraic notation, such as Nf3 or O-O.
            </p>
            <div className="mt-3 flex gap-3">
              <input
                id="move"
                type="text"
                value={moveDraft}
                onChange={(event) => setMoveDraft(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                aria-invalid={moveError ? true : undefined}
                aria-describedby={moveError ? "move-help move-error" : "move-help"}
                className={`${fieldClass} min-w-0 flex-1`}
              />
              <Button type="submit">Play</Button>
            </div>
            {moveError ? (
              <p id="move-error" role="alert" className="mt-2 font-semibold text-bad-edge">
                {moveError}
              </p>
            ) : null}
          </form>

          <div>
            <h2 className="font-display text-lg font-bold">Moves</h2>
            <p className="mt-1 text-ink-soft">{moves.length ? formatMoveList(game.startFen, moves) : "No moves played yet."}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" disabled={moves.length === 0} onClick={undo}>
                Undo
              </Button>
              <Button variant="secondary" onClick={() => setOrientation((side) => (side === "w" ? "b" : "w"))}>
                Flip board
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
