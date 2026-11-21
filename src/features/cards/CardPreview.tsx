import { answerText, CATEGORIES, sideName, type Card } from "../../domain/cards";
import { ContinuationViewer } from "../../moves/ContinuationViewer";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-ink-soft">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

/** One saved card laid out as the front and the back, with a board for following the moves. */
export function CardPreview({ card }: { card: Card }) {
  const category = CATEGORIES.find((option) => option.value === card.category)?.label ?? card.category;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <ContinuationViewer fen={card.fen} continuation={card.continuation} orientation={card.side} />
      <dl className="space-y-4">
        <Row label="Question">{card.prompt}</Row>
        {card.hint ? <Row label="Hint">{card.hint}</Row> : null}
        <Row label={card.kind === "move" ? "Answer" : "Answer line"}>
          <span className="font-mono">{answerText(card.fen, card.answer)}</span>
        </Row>
        {card.alternatives.length > 0 ? (
          <Row label="Also accepted">
            <span className="font-mono">{card.alternatives.map((move) => move.san).join(", ")}</span>
          </Row>
        ) : null}
        {card.explanation ? <Row label="Explanation">{card.explanation}</Row> : null}
        {card.notes ? <Row label="Notes">{card.notes}</Row> : null}
        <Row label="Details">
          {card.kind === "move" ? "One move" : "A line"}, {category}, you play {sideName(card.side)}
          {card.tags.length > 0 ? `. Tags: ${card.tags.join(", ")}` : ""}
        </Row>
      </dl>
    </div>
  );
}
