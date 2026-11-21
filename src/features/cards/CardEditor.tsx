import { useMemo, useState, type FormEvent } from "react";
import {
  alternativesText,
  answerText,
  CATEGORIES,
  checkContinuation,
  defaultPrompt,
  nodeMove,
  parseAlternatives,
  parseAnswer,
  parseTags,
  sideName,
  type CardCategory,
  type CardDraft,
  type CardKind,
} from "../../domain/cards";
import { getNode, mainlineFrom, sideToMove } from "../../domain/pgn";
import { answerNodeIds } from "../../domain/richText";
import type { DeckSummary } from "../../data/repo";
import { ContinuationViewer } from "../../moves/ContinuationViewer";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { Field, fieldClass } from "../../ui/Field";
import { DeckPicker, NEW_DECK } from "./DeckPicker";

export type DeckChoice = { type: "existing"; id: string } | { type: "new"; name: string };

type Props = {
  mode: "new" | "edit";
  initial: CardDraft;
  decks: DeckSummary[];
  /** The deck to pre-select. */
  deckId?: string;
  /** The deck is already decided, so don't ask for it. Pass `deckId` too. */
  fixedDeck?: boolean;
  /** Saves the card. Resolves to an error message, or null when it worked. */
  onSave: (deck: DeckChoice, draft: CardDraft) => Promise<string | null>;
  onCancel: () => void;
};

const LINE_DEFAULT_PLIES = 6;

const segmentClass = (active: boolean) =>
  [
    "rounded-xl border-2 px-4 py-2 font-display font-bold transition-colors",
    active ? "border-brand bg-brand-wash text-brand" : "border-line-strong bg-surface text-ink hover:bg-line/40",
  ].join(" ");

/** What used to be a separate notes box is kept by folding it into the explanation. */
function joinExplanation(explanation: string, notes: string): string {
  return [explanation.trim(), notes.trim()].filter(Boolean).join("\n\n");
}

/**
 * The card form: the question and answer, then one explanation for the back.
 * The moves shown on the back come from the line the card was made from, or
 * from the answer, so there is no separate box for them. Hint, other accepted
 * moves, type and tags sit under "More options".
 */
export function CardEditor({ mode, initial, decks, deckId, fixedDeck = false, onSave, onCancel }: Props) {
  const fen = initial.fen;
  const [kind, setKind] = useState<CardKind>(initial.kind);
  const [side, setSide] = useState<"w" | "b">(initial.side);
  const [category, setCategory] = useState<CardCategory>(initial.category);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [hint, setHint] = useState(initial.hint);
  const [answer, setAnswer] = useState(() => answerText(fen, initial.answer));
  const [others, setOthers] = useState(() => alternativesText(initial.alternatives));
  const [explanation, setExplanation] = useState(() => joinExplanation(initial.explanation, initial.notes));
  const [tagText, setTagText] = useState(initial.tags.join(", "));
  const [deckChoice, setDeckChoice] = useState(deckId ?? decks[0]?.id ?? NEW_DECK);
  const [newDeckName, setNewDeckName] = useState("");
  const [moreOpen, setMoreOpen] = useState(
    initial.hint !== "" || initial.alternatives.length > 0 || initial.tags.length > 0 || initial.category !== "opening",
  );
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const effectiveSide = kind === "move" ? sideToMove(fen) : side;
  const parsedAnswer = useMemo(() => parseAnswer(fen, answer, kind), [fen, answer, kind]);
  const parsedOthers = useMemo(
    () => (kind === "move" ? parseAlternatives(fen, others, parsedAnswer.ok ? parsedAnswer.moves : []) : null),
    [fen, others, kind, parsedAnswer],
  );
  const checkedContinuation = useMemo(() => checkContinuation(fen, initial.continuation), [fen, initial.continuation]);

  // The moves on the back are the line the card came from, as long as they still start with the answer.
  // Change the answer to something else and the back follows the answer instead.
  const hasLine = initial.continuation.trim() !== "";
  const followsAnswer = useMemo(
    () => hasLine && checkedContinuation.ok && parsedAnswer.ok && answerNodeIds(checkedContinuation.tree, parsedAnswer.moves) !== null,
    [hasLine, checkedContinuation, parsedAnswer],
  );
  const backMoves = followsAnswer ? initial.continuation : parsedAnswer.ok ? answerText(fen, parsedAnswer.moves) : "";

  const errors = {
    deck: deckChoice === NEW_DECK && newDeckName.trim() === "" ? "Give the new deck a name." : null,
    prompt: prompt.trim() === "" ? "Write what the card asks." : null,
    answer: parsedAnswer.ok ? null : parsedAnswer.error,
    others: parsedOthers && !parsedOthers.ok ? parsedOthers.error : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const showMore = moreOpen || Boolean(errors.others);
  const shown = (key: keyof typeof errors) => (key === "deck" || key === "prompt" ? (tried ? errors[key] : null) : errors[key]);

  function chooseKind(next: CardKind) {
    if (next === kind) return;
    setKind(next);
    // Offer a sensible answer from the continuation's main line.
    if (checkedContinuation.ok && hasLine) {
      const tree = checkedContinuation.tree;
      const moves = mainlineFrom(tree, tree.rootId).map((id) => nodeMove(getNode(tree, id)));
      if (moves.length > 0) {
        setAnswer(answerText(fen, moves.slice(0, next === "move" ? 1 : LINE_DEFAULT_PLIES)));
        return;
      }
    }
    if (next === "move" && parsedAnswer.ok) setAnswer(answerText(fen, parsedAnswer.moves.slice(0, 1)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setSaveError(null);
    if (hasErrors || !parsedAnswer.ok) return;

    const draft: CardDraft = {
      kind,
      category,
      fen,
      side: effectiveSide,
      prompt: prompt.trim(),
      hint: hint.trim(),
      answer: parsedAnswer.moves,
      alternatives: parsedOthers && parsedOthers.ok ? parsedOthers.moves : [],
      explanation: explanation.trim(),
      continuation: followsAnswer ? initial.continuation.trim() : "",
      notes: "",
      tags: parseTags(tagText),
      ...(initial.sourceId ? { sourceId: initial.sourceId } : {}),
      ...(initial.sourcePly !== undefined ? { sourcePly: initial.sourcePly } : {}),
    };
    const choice: DeckChoice = deckChoice === NEW_DECK ? { type: "new", name: newDeckName } : { type: "existing", id: deckChoice };
    setBusy(true);
    const problem = await onSave(choice, draft);
    setBusy(false);
    if (problem) setSaveError(problem);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <section aria-labelledby="back-heading" className="lg:sticky lg:top-6 lg:self-start">
        <h2 id="back-heading" className="font-display text-xl font-bold">
          Back of the card
        </h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">
          {hasLine && !followsAnswer
            ? "The moves follow your answer now. The line this card came from no longer starts with it."
            : hasLine
              ? "The line this card came from. Click a move to follow it on the board."
              : "Your answer, played out. Click a move to follow it on the board."}
        </p>
        <ContinuationViewer fen={fen} continuation={backMoves} orientation={effectiveSide} />
      </section>

      <div className="space-y-7">
        <fieldset>
          <legend className="font-display text-lg font-bold">Card type</legend>
          <div className="mt-2 flex flex-wrap gap-3" role="radiogroup" aria-label="Card type">
            <button type="button" role="radio" aria-checked={kind === "move"} className={segmentClass(kind === "move")} onClick={() => chooseKind("move")}>
              Find one move
            </button>
            <button type="button" role="radio" aria-checked={kind === "line"} className={segmentClass(kind === "line")} onClick={() => chooseKind("line")}>
              Recall a line
            </button>
          </div>
          {kind === "line" ? (
            <div className="mt-4" role="radiogroup" aria-label="You play">
              <p className="text-sm text-ink-soft">You play</p>
              <div className="mt-2 flex gap-3">
                {(["w", "b"] as const).map((colour) => (
                  <button key={colour} type="button" role="radio" aria-checked={side === colour} className={segmentClass(side === colour)} onClick={() => setSide(colour)}>
                    {sideName(colour)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </fieldset>

        {fixedDeck ? null : (
          <DeckPicker
            decks={decks}
            value={deckChoice}
            newName={newDeckName}
            allowNew={mode === "new"}
            error={shown("deck")}
            onChange={(value, name) => {
              setDeckChoice(value);
              setNewDeckName(name);
            }}
          />
        )}

        <Field id="prompt" label="Question" error={shown("prompt")}>
          {(aria) => <input {...aria} className={fieldClass} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={defaultPrompt(effectiveSide)} />}
        </Field>

        <Field
          id="answer"
          label={kind === "move" ? "Answer" : "Answer line"}
          help={kind === "move" ? "The move, such as Nf3. Use standard notation." : "The moves to recall, such as 1. e4 e5 2. Nf3. Opponent moves are played for the learner."}
          error={shown("answer")}
        >
          {(aria) =>
            kind === "move" ? (
              <input {...aria} className={`${fieldClass} font-mono`} value={answer} onChange={(event) => setAnswer(event.target.value)} />
            ) : (
              <textarea {...aria} rows={2} className={`${fieldClass} font-mono`} value={answer} onChange={(event) => setAnswer(event.target.value)} />
            )
          }
        </Field>

        <Field id="explanation" label="Explanation (optional)" help="Why the move works, in your own words. It is shown on the back.">
          {(aria) => <textarea {...aria} rows={5} className={fieldClass} value={explanation} onChange={(event) => setExplanation(event.target.value)} />}
        </Field>

        <div>
          <button
            type="button"
            aria-expanded={showMore}
            aria-controls="more-options"
            onClick={() => setMoreOpen((open) => !open)}
            className="rounded-lg font-display text-lg font-bold underline underline-offset-4"
          >
            {showMore ? "Fewer options" : "More options"}
          </button>
          {showMore ? (
            <div id="more-options" className="mt-5 space-y-7">
          <Field id="hint" label="Hint (optional)" help="Shown only if the learner asks for it.">
            {(aria) => <input {...aria} className={fieldClass} value={hint} onChange={(event) => setHint(event.target.value)} />}
          </Field>
          {kind === "move" ? (
            <Field id="others" label="Other accepted moves (optional)" help="Separate them with commas, for example d4, c4." error={shown("others")}>
              {(aria) => <input {...aria} className={`${fieldClass} font-mono`} value={others} onChange={(event) => setOthers(event.target.value)} />}
            </Field>
          ) : null}
              <div className="grid gap-7 sm:grid-cols-2">
                <Field id="category" label="Type of position">
                  {(aria) => (
                    <select {...aria} className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value as CardCategory)}>
                      {CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field id="tags" label="Tags (optional)" help="Separate them with commas.">
                  {(aria) => <input {...aria} className={fieldClass} value={tagText} onChange={(event) => setTagText(event.target.value)} />}
                </Field>
              </div>
            </div>
          ) : null}
        </div>

        {tried && hasErrors ? <Feedback tone="bad" title="Fix the highlighted fields first." /> : null}
        {saveError ? (
          <Feedback tone="bad" title="Not saved">
            {saveError}
          </Feedback>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg" disabled={busy}>
            {mode === "new" ? "Save card" : "Save changes"}
          </Button>
          <Button size="lg" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
