import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { parseFen, START_FEN } from "../../domain/fen";
import type { PgnGame } from "../../domain/pgn";
import { Button } from "../../ui/Button";
import { Field, fieldClass } from "../../ui/Field";

type PositionPanelProps = {
  /** The FEN of the position on the board. */
  fen: string;
  /** The line is built from the position on the board, so typed moves go on from here. */
  onSetFen: (fen: string) => void;
  onStart: () => void;
  /** Plays typed moves from the board position. Returns an error message, or null when they were added. */
  onAddMoves: (text: string) => string | null;
};

/** A FEN box and a moves box: set up any position, then type or paste the moves that follow. */
export function PositionPanel({ fen, onSetFen, onStart, onAddMoves }: PositionPanelProps) {
  const [fenDraft, setFenDraft] = useState(fen);
  const [shownFen, setShownFen] = useState(fen);
  const [fenError, setFenError] = useState<string | null>(null);
  const [movesDraft, setMovesDraft] = useState("");
  const [movesError, setMovesError] = useState<string | null>(null);

  // Keep the box in step with the board when the position changes from outside.
  if (fen !== shownFen) {
    setShownFen(fen);
    setFenDraft(fen);
    setFenError(null);
  }

  function setPosition(event: FormEvent) {
    event.preventDefault();
    const parsed = parseFen(fenDraft);
    if (!parsed.ok) return setFenError(parsed.error);
    setFenError(null);
    onSetFen(parsed.fen);
  }

  function addMoves(event: FormEvent) {
    event.preventDefault();
    const problem = onAddMoves(movesDraft);
    setMovesError(problem);
    if (!problem) setMovesDraft("");
  }

  return (
    <div className="space-y-8">
      <form onSubmit={setPosition} noValidate>
        <Field
          id="fen"
          label="FEN"
          help="Paste a position to start from, or leave the starting position."
          error={fenError}
        >
          {(aria) => (
            <textarea
              {...aria}
              rows={2}
              spellCheck={false}
              className={`${fieldClass} font-mono text-sm`}
              value={fenDraft}
              onChange={(event) => setFenDraft(event.target.value)}
            />
          )}
        </Field>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit">Set position</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFenDraft(START_FEN);
              setFenError(null);
              onStart();
            }}
          >
            Start position
          </Button>
        </div>
      </form>

      <form onSubmit={addMoves} noValidate>
        <Field
          id="moves"
          label="Moves"
          help="Type or paste moves such as 1. e4 e5 2. Nf3. They are played from the position on the board. Comments in { } and variations in ( ) are kept."
          error={movesError}
        >
          {(aria) => (
            <textarea
              {...aria}
              rows={3}
              spellCheck={false}
              placeholder="1. e4 c5 2. Nf3 d6"
              className={`${fieldClass} font-mono text-sm`}
              value={movesDraft}
              onChange={(event) => setMovesDraft(event.target.value)}
            />
          )}
        </Field>
        <div className="mt-4">
          <Button type="submit">Add moves</Button>
        </div>
      </form>
    </div>
  );
}

type PgnPanelProps = {
  /** Called with the game to work on, and the text it came from. */
  onLoad: (game: PgnGame, text: string) => void;
  /** Reads the text. Returns the games, or an error message. */
  parse: (text: string) => { games: PgnGame[] } | { error: string };
};

/** Paste or open a PGN, pick a game if there are several, and load it. */
export function PgnPanel({ onLoad, parse }: PgnPanelProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<PgnGame[]>([]);
  const [chosen, setChosen] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  function read(source: string) {
    const result = parse(source);
    if ("error" in result) {
      setError(result.error);
      setGames([]);
      return;
    }
    setError(null);
    setGames(result.games);
    setChosen(0);
    onLoad(result.games[0], source);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    read(text);
  }

  function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const contents = typeof reader.result === "string" ? reader.result : "";
      setText(contents);
      read(contents);
    };
    reader.onerror = () => setError("That file couldn't be read.");
    reader.readAsText(file);
  }

  const game = games[chosen];
  const details = game
    ? [game.headers.Event, game.headers.Date && game.headers.Date !== "????.??.??" ? game.headers.Date : "", game.result]
        .filter((part) => part && part !== "?")
        .join(", ")
    : "";

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field id="pgn" label="PGN" help="Paste a game or a repertoire. Variations and comments are kept." error={error}>
        {(aria) => (
          <textarea
            {...aria}
            rows={8}
            spellCheck={false}
            className={`${fieldClass} font-mono text-sm`}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit">Read PGN</Button>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          Open a .pgn file
        </Button>
        <input ref={fileInput} type="file" accept=".pgn,.txt,text/plain" className="sr-only" tabIndex={-1} aria-label="PGN file" onChange={openFile} />
      </div>

      {games.length > 1 ? (
        <Field id="game" label="Game">
          {(aria) => (
            <select
              {...aria}
              className={fieldClass}
              value={chosen}
              onChange={(event) => {
                const index = Number(event.target.value);
                setChosen(index);
                onLoad(games[index], text);
              }}
            >
              {games.map((item, index) => (
                <option key={index} value={index}>
                  {index + 1}. {item.title}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {game ? (
        <p className="text-ink-soft" role="status">
          Loaded {game.title}
          {details ? ` (${details})` : ""}.
        </p>
      ) : null}
    </form>
  );
}
