import { useEffect, useRef, type ReactNode } from "react";
import { getNode, moveLabel, type LineTree, type PgnNode } from "../domain/pgn";

const NAG_SYMBOLS: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };

type MoveTreeProps = {
  tree: LineTree;
  /** Show the moves that follow this position. Defaults to the start. */
  fromId?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  label?: string;
};

type SequenceProps = Omit<MoveTreeProps, "fromId" | "label"> & { leadId: string; altIds: string[] };

function Comment({ text }: { text: string }) {
  return <span className="mx-1 italic text-ink-soft">{text}</span>;
}

/** The moves written like PGN: main line inline, each variation indented under the move it replaces. */
function Sequence({ tree, leadId, altIds, selectedId, onSelect }: SequenceProps) {
  const parts: ReactNode[] = [];
  let lead: string | undefined = leadId;
  let alts = altIds;
  let numbered = true;

  while (lead !== undefined) {
    const node: PgnNode = getNode(tree, lead);
    const parent = getNode(tree, node.parentId as string);
    const [, side, , , , full] = parent.fen.split(" ");

    if (node.commentBefore) {
      parts.push(<Comment key={`${node.id}-before`} text={node.commentBefore} />);
      numbered = true;
    }
    const prefix = side === "w" ? `${full}.` : numbered ? `${full}...` : "";
    const symbols = node.nags.map((nag) => NAG_SYMBOLS[nag]).filter(Boolean).join("");
    const selected = node.id === selectedId;
    parts.push(
      <span key={node.id} className="whitespace-nowrap">
        {prefix ? <span className="mr-1 text-ink-soft">{prefix}</span> : null}
        <button
          type="button"
          data-move-id={node.id}
          aria-label={moveLabel(tree, node.id)}
          aria-current={selected ? "true" : undefined}
          onClick={() => onSelect(node.id)}
          className={[
            "rounded-md px-1.5 py-0.5 font-semibold transition-colors",
            selected ? "bg-brand text-white" : "text-ink hover:bg-brand-wash",
          ].join(" ")}
        >
          {node.san}
          {symbols}
        </button>{" "}
      </span>,
    );
    numbered = false;

    if (node.comment) {
      parts.push(<Comment key={`${node.id}-after`} text={node.comment} />);
      numbered = true;
    }
    for (const alt of alts) {
      parts.push(
        <div key={`${node.id}-var-${alt}`} className="my-1 ml-2 border-l-2 border-line-strong pl-3 text-[0.95em] text-ink-soft">
          <Sequence tree={tree} leadId={alt} altIds={[]} selectedId={selectedId} onSelect={onSelect} />
        </div>,
      );
      numbered = true;
    }
    lead = node.childIds[0];
    alts = node.childIds.slice(1);
  }
  return <>{parts}</>;
}

/**
 * Clickable move notation. Every move is a button: clicking one tells the
 * parent which move was chosen, and the parent moves the board there.
 */
export function MoveTree({ tree, fromId, selectedId, onSelect, label = "Moves" }: MoveTreeProps) {
  const start = getNode(tree, fromId ?? tree.rootId);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    const button = container.current?.querySelector<HTMLElement>(`[data-move-id="${selectedId}"]`);
    button?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  if (start.childIds.length === 0) return null;
  return (
    <div ref={container} role="group" aria-label={label} className="text-lg/9">
      <Sequence
        tree={tree}
        leadId={start.childIds[0]}
        altIds={start.childIds.slice(1)}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}
