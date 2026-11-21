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

/**
 * The card form: front (position, question, hint), answer, and back
 * (explanation, notes and a continuation whose moves can be clicked).
 */
export function CardEditor({ mode, initial, decks, deckId, onSave, onCancel }: Props) {
  const fen = initial.fen;
  const [kind, setKind] = useState<CardKind>(initial.kind);
  const [side, setSide] = useState<"w" | "b">(initial.side);
  const [category, setCategory] = useState<CardCategory>(initial.category);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [hint, setHint] = useState(initial.hint);
  const [answer, setAnswer] = useState(() => answerText(fen, initial.answer));
  const [others, setOthers] = useState(() => alternativesText(initial.alternatives));
  const [explanation, setExplanation] = useState(initial.explanation);
  const [continuation, setContinuation] = useState(initial.continuation);
  const [notes, setNotes] = useState(initial.notes);
  const [tagText, setTagText] = useState(initial.tags.join(", "));
  const [deckChoice, setDeckChoice] = useState(deckId ?? decks[0]?.id ?? NEW_DECK);
  const [newDeckName, setNewDeckName] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const effectiveSide = kind === "move" ? sideToMove(fen) : side;
  const parsedAnswer = useMemo(() => parseAnswer(fen, answer, kind), [fen, answer, kind]);
  const parsedOthers = useMemo(
    () => (kind === "move" ? parseAlternatives(fen, others, parsedAnswer.ok ? parsedAnswer.moves : []) : null),
    [fen, others, kind, parsedAnswer],
  );
  const checkedContinuation = useMemo(() => checkContinuation(fen, continuation), [fen, continuation]);

  const errors = {
    deck: deckChoice === NEW_DECK && newDeckName.trim() === "" ? "Give the new deck a name." : null,
    prompt: prompt.trim() === "" ? "Write what the card asks." : null,
    answer: parsedAnswer.ok ? null : parsedAnswer.error,
    others: parsedOthers && !parsedOthers.ok ? parsedOthers.error : null,
    continuation: checkedContinuation.ok ? null : checkedContinuation.error,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const shown = (key: keyof typeof errors) => (key === "deck" || key === "prompt" ? (tried ? errors[key] : null) : errors[key]);

  function chooseKind(next: CardKind) {
    if (next === kind) return;
    setKind(next);
    // Offer a sensible answer from the continuation's main line.
    if (checkedContinuation.ok) {
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
      continuation: continuation.trim(),
      notes: notes.trim(),
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
          Position and continuation
        </h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">
          This is how the back of the card will look. Click a move to follow it on the board.
        </p>
        <ContinuationViewer fen={fen} continuation={continuation} orientation={effectiveSide} />
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

        <Field id="prompt" label="Question" error={shown("prompt")}>
          {(aria) => <input {...aria} className={fieldClass} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={defaultPrompt(effectiveSide)} />}
        </Field>

        <Field id="hint" label="Hint (optional)" help="Shown only if the learner asks for it.">
          {(aria) => <input {...aria} className={fieldClass} value={hint} onChange={(event) => setHint(event.target.value)} />}
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

        {kind === "move" ? (
          <Field id="others" label="Other accepted moves (optional)" help="Separate them with commas, for example d4, c4." error={shown("others")}>
            {(aria) => <input {...aria} className={`${fieldClass} font-mono`} value={others} onChange={(event) => setOthers(event.target.value)} />}
          </Field>
        ) : null}

        <Field id="explanation" label="Explanation" help="In your own words. Shown on the back of the card.">
          {(aria) => <textarea {...aria} rows={4} className={fieldClass} value={explanation} onChange={(event) => setExplanation(event.target.value)} />}
        </Field>

        <Field
          id="continuation"
          label="Continuation (PGN)"
          help="Moves with their { comments } and (variations) are kept and shown on the back, and every move is clickable."
          error={shown("continuation")}
        >
          {(aria) => <textarea {...aria} rows={6} className={`${fieldClass} font-mono text-sm`} value={continuation} onChange={(event) => setContinuation(event.target.value)} />}
        </Field>

        <Field id="notes" label="Notes (optional)">
          {(aria) => <textarea {...aria} rows={2} className={fieldClass} value={notes} onChange={(event) => setNotes(event.target.value)} />}
        </Field>

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
