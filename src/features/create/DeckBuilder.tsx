import { useMemo, useState } from "react";
import { buildDeckCards, CATEGORIES, sideName, type CardCategory, type CardDraft } from "../../domain/cards";
import { sideToMove, type LineTree } from "../../domain/pgn";
import type { DeckSummary } from "../../data/repo";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { Field, fieldClass } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";
import { DeckPicker, NEW_DECK } from "../cards/DeckPicker";
import type { DeckChoice } from "../cards/CardEditor";

type Props = {
  tree: LineTree;
  /** The position shown on the board, which the deck can start from. */
  currentId: string;
  decks: DeckSummary[];
  /** The deck to pre-select. */
  deckId?: string;
  /** The deck is already decided, so don't ask for it. Pass `deckId` too. */
  fixedDeck?: boolean;
  /** Saves the cards. Resolves to an error message, or null when it worked. */
  onBuild: (deck: DeckChoice, drafts: CardDraft[]) => Promise<string | null>;
  onCancel: () => void;
};

const PREVIEW_LIMIT = 8;

/** Turns the line on the board into cards: one for each of your moves, or one for the whole line. */
export function DeckBuilder({ tree, currentId, decks, deckId, fixedDeck = false, onBuild, onCancel }: Props) {
  const [side, setSide] = useState<"w" | "b">(() => sideToMove(tree.startFen));
  const [shape, setShape] = useState<"moves" | "line">("moves");
  const [context, setContext] = useState<"rest" | "reply">("rest");
  const [start, setStart] = useState<"line" | "here">("line");
  const [category, setCategory] = useState<CardCategory>("opening");
  const [deckChoice, setDeckChoice] = useState(deckId ?? decks[0]?.id ?? NEW_DECK);
  const [newDeckName, setNewDeckName] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const canStartHere = currentId !== tree.rootId;
  const plan = useMemo(
    () =>
      buildDeckCards(tree, {
        side,
        shape,
        context,
        category,
        ...(start === "here" && canStartHere ? { fromId: currentId } : {}),
      }),
    [tree, side, shape, context, category, start, canStartHere, currentId],
  );

  const deckError = deckChoice === NEW_DECK && newDeckName.trim() === "" ? "Give the new deck a name." : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    setProblem(null);
    if (deckError || !plan.ok) return;
    setBusy(true);
    const choice: DeckChoice = deckChoice === NEW_DECK ? { type: "new", name: newDeckName } : { type: "existing", id: deckChoice };
    const message = await onBuild(choice, plan.drafts);
    setBusy(false);
    if (message) setProblem(message);
  }

  const answers = plan.ok ? plan.drafts.map((draft) => draft.answer.map((move) => move.san).join(" ")) : [];

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      <div>
        <p className="text-ink-soft">
          Only the main line gets cards. Variations and comments aren't lost: they appear on the back of the cards they belong to.
        </p>
      </div>

      <div>
        <p className="font-display text-lg font-bold">You are learning</p>
        <div className="mt-2">
          <Segmented
            label="You are learning"
            value={side}
            onChange={setSide}
            options={[
              { value: "w", label: "White" },
              { value: "b", label: "Black" },
            ]}
          />
        </div>
      </div>

      <div>
        <p className="font-display text-lg font-bold">Cards</p>
        <div className="mt-2">
          <Segmented
            label="Cards"
            value={shape}
            onChange={setShape}
            options={[
              { value: "moves", label: "One for each of my moves" },
              { value: "line", label: "One for the whole line" },
            ]}
          />
        </div>
      </div>

      {shape === "moves" ? (
        <div>
          <p className="font-display text-lg font-bold">Back of each card</p>
          <div className="mt-2">
            <Segmented
              label="Back of each card"
              value={context}
              onChange={setContext}
              options={[
                { value: "rest", label: "The rest of the line" },
                { value: "reply", label: "My move and the reply" },
              ]}
            />
          </div>
        </div>
      ) : null}

      {canStartHere ? (
        <div>
          <p className="font-display text-lg font-bold">Start from</p>
          <div className="mt-2">
            <Segmented
              label="Start from"
              value={start}
              onChange={setStart}
              options={[
                { value: "line", label: "The start of the line" },
                { value: "here", label: "The position on the board" },
              ]}
            />
          </div>
        </div>
      ) : null}

      {fixedDeck ? null : (
        <DeckPicker
          decks={decks}
          value={deckChoice}
          newName={newDeckName}
          error={tried ? deckError : null}
          onChange={(value, name) => {
            setDeckChoice(value);
            setNewDeckName(name);
          }}
        />
      )}

      <Field id="deck-category" label="Type of position">
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

      <section aria-live="polite" className="rounded-2xl bg-brand-wash p-5">
        {plan.ok ? (
          <>
            <p className="font-display text-lg font-bold">
              {shape === "line"
                ? `One card with ${plan.drafts[0].answer.length} moves`
                : `${plan.drafts.length} ${plan.drafts.length === 1 ? "card" : "cards"}`}
            </p>
            <p className="mt-1 text-ink-soft">
              {shape === "line"
                ? `${sideName(side)} recalls the line: ${answers[0]}`
                : `Answers: ${answers.slice(0, PREVIEW_LIMIT).join(", ")}${answers.length > PREVIEW_LIMIT ? `, and ${answers.length - PREVIEW_LIMIT} more` : ""}`}
            </p>
          </>
        ) : (
          <p className="font-semibold text-bad-edge">{plan.error}</p>
        )}
      </section>

      {problem ? (
        <Feedback tone="bad" title="Not saved">
          {problem}
        </Feedback>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={busy || !plan.ok}>
          Add cards
        </Button>
        <Button size="lg" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
