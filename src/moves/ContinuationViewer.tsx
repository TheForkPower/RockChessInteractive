import { useMemo, useState, type KeyboardEvent } from "react";
import { Board } from "../board/Board";
import { getNode, mainlineFrom, parseMovetext } from "../domain/pgn";
import { MoveTree } from "./MoveTree";
import { StepButtons } from "./StepButtons";

type Props = {
  /** The position the continuation starts from. */
  fen: string;
  /** PGN movetext, with comments and variations. */
  continuation: string;
  orientation?: "w" | "b";
  /** Shown while there is no continuation. */
  emptyText?: string;
  /**
   * To let the page decide which move is shown (so moves elsewhere on the page
   * can drive the board), pass both of these. Otherwise the viewer keeps its own.
   */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Hide the written-out moves under the arrows, when the page lists them elsewhere. */
  showMoves?: boolean;
};

/**
 * A board with the continuation written beside it. Click any move, or use the
 * arrow keys, to step through it. Variations can be followed too.
 */
export function ContinuationViewer({
  fen,
  continuation,
  orientation = "w",
  emptyText = "No continuation on this card.",
  selectedId: controlledId,
  onSelect,
  showMoves = true,
}: Props) {
  const parsed = useMemo(() => parseMovetext(continuation, fen), [continuation, fen]);
  const [ownPick, setOwnPick] = useState<string | null>(null);
  const picked = onSelect ? (controlledId ?? null) : ownPick;
  const setPicked = (id: string) => (onSelect ? onSelect(id) : setOwnPick(id));

  const tree = parsed.ok ? parsed.tree : null;
  const selectedId = tree && picked && tree.nodes[picked] ? picked : (tree?.rootId ?? "");
  const selected = tree ? getNode(tree, selectedId) : null;
  const hasMoves = Boolean(tree && getNode(tree, tree.rootId).childIds.length > 0);

  function go(id: string | undefined) {
    if (id) setPicked(id);
  }
  const back = () => go(selected?.parentId ?? undefined);
  const forward = () => go(selected?.childIds[0]);
  const start = () => go(tree?.rootId);
  const end = () => {
    if (!tree) return;
    const rest = mainlineFrom(tree, selectedId);
    go(rest.length > 0 ? rest[rest.length - 1] : selectedId);
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
    const keys: Record<string, () => void> = { ArrowLeft: back, ArrowRight: forward, Home: start, End: end };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  return (
    <div role="group" aria-label="Continuation viewer" onKeyDown={onKeyDown}>
      <Board
        fen={selected?.fen ?? fen}
        orientation={orientation}
        interactive={false}
        lastMove={selected && selected.from && selected.to ? { from: selected.from, to: selected.to } : null}
        label="Chessboard showing the selected move"
      />

      <div className="mt-3">
        <StepButtons
          canBack={Boolean(selected?.parentId)}
          canForward={Boolean(selected && selected.childIds.length > 0)}
          onStart={start}
          onBack={back}
          onForward={forward}
          onEnd={end}
        />
      </div>

      <div className={showMoves || !parsed.ok ? "mt-4" : ""}>
        {!parsed.ok ? (
          <p role="alert" className="text-bad-edge">
            The continuation has a problem: {parsed.error}
          </p>
        ) : !showMoves ? null : hasMoves && tree ? (
          <div className="max-h-72 overflow-y-auto rounded-2xl border-2 border-line bg-surface p-4">
            <MoveTree tree={tree} selectedId={selectedId === tree.rootId ? null : selectedId} onSelect={setPicked} label="Continuation" />
          </div>
        ) : (
          <p className="text-ink-soft">{emptyText}</p>
        )}
      </div>
    </div>
  );
}
