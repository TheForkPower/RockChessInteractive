import { useId, useMemo, useState } from "react";
import piecesUrl from "cm-chessboard/assets/pieces/standard.svg?url";
import { parseFen } from "../../domain/fen";
import {
  castlingPossible,
  clearedSetup,
  effectiveCastling,
  fenToSetup,
  movePiece,
  PIECE_TYPES,
  pieceName,
  placePiece,
  removePiece,
  setupToFen,
  squareName,
  startSetup,
  type Castling,
  type Piece,
  type PieceColor,
  type Setup,
} from "../../domain/boardSetup";
import { Button } from "../../ui/Button";
import { Segmented } from "../../ui/Segmented";

type Tool = { kind: "move" } | { kind: "erase" } | { kind: "piece"; piece: Piece };

const COLOURS: PieceColor[] = ["w", "b"];

function PieceIcon({ piece }: { piece: Piece }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="h-full w-full">
      <use href={`${piecesUrl}#${piece.color}${piece.type}`} />
    </svg>
  );
}

const sameTool = (a: Tool, b: Tool) =>
  a.kind === b.kind && (a.kind !== "piece" || (b.kind === "piece" && a.piece.color === b.piece.color && a.piece.type === b.piece.type));

type Props = {
  /** The position to start from. */
  initialFen: string;
  /** Called with a checked, ready-to-use FEN. */
  onUse: (fen: string) => void;
  onCancel: () => void;
};

/**
 * Sets up a position by hand: pick a piece, click squares to place it, or move
 * pieces about. Nothing is trusted until the FEN it makes passes the same
 * checks as a FEN typed on the Create page.
 */
export function BoardEditor({ initialFen, onUse, onCancel }: Props) {
  const [setup, setSetup] = useState<Setup>(() => fenToSetup(initialFen) ?? startSetup());
  const [tool, setTool] = useState<Tool>({ kind: "move" });
  const [picked, setPicked] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const ids = useId();

  const fen = useMemo(() => setupToFen(setup), [setup]);
  const checked = useMemo(() => parseFen(fen), [fen]);
  const possible = castlingPossible(setup.squares);
  const rights = effectiveCastling(setup);

  function change(update: Partial<Setup>) {
    setSetup((previous) => ({ ...previous, ...update }));
  }

  function chooseTool(next: Tool) {
    setTool(next);
    setPicked(null);
  }

  function clickSquare(index: number) {
    if (tool.kind === "piece") {
      change({ squares: placePiece(setup.squares, index, tool.piece) });
    } else if (tool.kind === "erase") {
      change({ squares: removePiece(setup.squares, index) });
    } else if (picked === null) {
      if (setup.squares[index]) setPicked(index);
    } else if (picked === index) {
      setPicked(null);
    } else if (!setup.squares[index] || setup.squares[index]?.color !== setup.squares[picked]?.color) {
      change({ squares: movePiece(setup.squares, picked, index) });
      setPicked(null);
    } else {
      setPicked(index);
    }
  }

  function toggleRight(key: keyof Castling) {
    change({ castling: { ...setup.castling, [key]: !rights[key] } });
  }

  const order = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i));
  const rightsList: { key: keyof Castling; label: string }[] = [
    { key: "K", label: "White can castle short" },
    { key: "Q", label: "White can castle long" },
    { key: "k", label: "Black can castle short" },
    { key: "q", label: "Black can castle long" },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="board-frame" role="group" aria-label="Board editor">
          <div className="grid aspect-square w-full grid-cols-8 grid-rows-8">
            {order.map((index) => {
              const piece = setup.squares[index];
              const file = index % 8;
              const rank = Math.floor(index / 8);
              const dark = (file + rank) % 2 === 1;
              const name = squareName(index);
              const edge = {
                rank: flipped ? file === 7 : file === 0,
                file: flipped ? rank === 0 : rank === 7,
              };
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={`${name}, ${piece ? pieceName(piece) : "empty"}`}
                  aria-pressed={picked === index ? true : undefined}
                  onClick={() => clickSquare(index)}
                  className={[
                    "relative block h-full w-full p-0 leading-none",
                    dark ? "bg-[#9fb0d2]" : "bg-[#edf0f7]",
                    picked === index ? "outline outline-4 -outline-offset-4 outline-brand" : "",
                  ].join(" ")}
                >
                  {piece ? <PieceIcon piece={piece} /> : null}
                  {edge.rank ? (
                    <span
                      aria-hidden="true"
                      className={`absolute left-[3px] top-[2px] text-[0.65rem] font-bold ${dark ? "text-[#edf0f7]" : "text-[#7083ad]"}`}
                    >
                      {8 - rank}
                    </span>
                  ) : null}
                  {edge.file ? (
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-[1px] right-[4px] text-[0.65rem] font-bold ${dark ? "text-[#edf0f7]" : "text-[#7083ad]"}`}
                    >
                      {"abcdefgh"[file]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setFlipped((value) => !value)}>
            Flip board
          </Button>
        </div>
      </div>

      <div className="space-y-10">
        <section aria-labelledby={`${ids}-pieces`}>
          <h2 id={`${ids}-pieces`} className="font-display text-lg font-bold">
            Pieces
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pick a piece, then click squares to place it. Click the same piece again to take it off. Or choose Move pieces:
            click a piece, then click the square it goes to.
          </p>
          <div className="mt-4 space-y-3" role="group" aria-label="Piece palette">
            {COLOURS.map((color) => (
              <div key={color} className="flex flex-wrap gap-2">
                {PIECE_TYPES.map((type) => {
                  const piece: Piece = { color, type };
                  const next: Tool = { kind: "piece", piece };
                  const active = sameTool(tool, next);
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-label={pieceName(piece)}
                      aria-pressed={active}
                      title={pieceName(piece)}
                      onClick={() => chooseTool(next)}
                      className={[
                        "h-14 w-14 rounded-xl border-2 p-1 transition-colors",
                        active ? "border-brand bg-brand-wash" : "border-line-strong bg-surface hover:bg-line/40",
                      ].join(" ")}
                    >
                      <PieceIcon piece={piece} />
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                aria-pressed={tool.kind === "move"}
                className={tool.kind === "move" ? "ring-4 ring-brand/40" : ""}
                onClick={() => chooseTool({ kind: "move" })}
              >
                Move pieces
              </Button>
              <Button
                variant="secondary"
                aria-pressed={tool.kind === "erase"}
                className={tool.kind === "erase" ? "ring-4 ring-brand/40" : ""}
                onClick={() => chooseTool({ kind: "erase" })}
              >
                Remove pieces
              </Button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setSetup(startSetup());
                setPicked(null);
              }}
            >
              Starting position
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSetup(clearedSetup());
                setPicked(null);
              }}
            >
              Clear board
            </Button>
          </div>
        </section>

        <section aria-labelledby={`${ids}-rules`}>
          <h2 id={`${ids}-rules`} className="font-display text-lg font-bold">
            Whose move
          </h2>
          <div className="mt-3">
            <Segmented
              label="Side to move"
              value={setup.turn}
              onChange={(turn) => change({ turn })}
              options={[
                { value: "w", label: "White to move" },
                { value: "b", label: "Black to move" },
              ]}
            />
          </div>

          <fieldset className="mt-6">
            <legend className="font-display text-lg font-bold">Castling</legend>
            <p className="mt-1 text-sm text-ink-soft">
              A choice is available only while the king and that rook are on their starting squares.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {rightsList.map(({ key, label }) => (
                <label
                  key={key}
                  className={`flex items-center gap-3 ${possible[key] ? "" : "text-ink-soft"}`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand"
                    checked={rights[key]}
                    disabled={!possible[key]}
                    onChange={() => toggleRight(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-6">
            <label htmlFor={`${ids}-move`} className="block font-display text-lg font-bold">
              Move number
            </label>
            <input
              id={`${ids}-move`}
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              className="mt-2 w-28 rounded-2xl border-2 border-line-strong bg-surface px-4 py-3 text-base text-ink"
              value={setup.moveNumber}
              onChange={(event) => change({ moveNumber: Math.max(1, Math.min(999, Math.floor(Number(event.target.value)) || 1)) })}
            />
          </div>
        </section>

        <section aria-labelledby={`${ids}-fen`} className="panel p-6">
          <h2 id={`${ids}-fen`} className="font-display text-xl font-bold">
            The position
          </h2>
          <label htmlFor={`${ids}-fen-text`} className="sr-only">
            FEN of this position
          </label>
          <textarea
            id={`${ids}-fen-text`}
            readOnly
            rows={2}
            spellCheck={false}
            className="mt-3 w-full rounded-2xl border-2 border-line bg-paper px-4 py-3 font-mono text-sm text-ink"
            value={fen}
            onFocus={(event) => event.currentTarget.select()}
          />
          {checked.ok ? (
            <p role="status" className="mt-3 font-semibold text-good-edge">
              This position is valid. {setup.turn === "w" ? "White" : "Black"} to move.
            </p>
          ) : (
            <p id={`${ids}-problem`} role="alert" className="mt-3 font-semibold text-bad-edge">
              {checked.error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              disabled={!checked.ok}
              aria-describedby={checked.ok ? undefined : `${ids}-problem`}
              onClick={() => checked.ok && onUse(checked.fen)}
            >
              Use this position
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

