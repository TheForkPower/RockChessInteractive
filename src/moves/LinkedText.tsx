import type { Piece } from "../domain/richText";

type MoveButtonProps = { selected: boolean; onClick: () => void; label?: string; children: string };

/** A move written inside a sentence or an answer. Pressing it puts the board on that move. */
export function MoveButton({ selected, onClick, label, children }: MoveButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
      className={[
        "rounded-md px-1 font-semibold underline decoration-dotted underline-offset-4 transition-colors",
        selected ? "bg-brand text-white decoration-transparent" : "text-brand hover:bg-brand-wash",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

type Props = {
  pieces: Piece[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
};

/** Words with the moves in them turned into buttons. */
export function LinkedText({ pieces, selectedId, onSelect }: Props) {
  return (
    <p className="whitespace-pre-wrap">
      {pieces.map((piece, index) =>
        piece.kind === "text" ? (
          <span key={index}>{piece.text}</span>
        ) : (
          <MoveButton key={index} selected={piece.nodeId === selectedId} onClick={() => onSelect(piece.nodeId)}>
            {piece.text}
          </MoveButton>
        ),
      )}
    </p>
  );
}
