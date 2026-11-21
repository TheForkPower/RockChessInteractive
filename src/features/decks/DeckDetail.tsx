import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { deleteCard, deleteDeck, renameDeck, setDeckColor, STORAGE_ERROR, updateCard, type DeckSummary } from "../../data/repo";
import { useCards, useDecks } from "../../data/hooks";
import { answerText, CATEGORIES, cardToDraft, type Card, type CardDraft } from "../../domain/cards";
import { colorOf, gradientOf } from "../../domain/deckColors";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { fieldClass } from "../../ui/Field";
import { ChevronLeftIcon } from "../../ui/Icons";
import { CardEditor, type DeckChoice } from "../cards/CardEditor";
import { CardPreview } from "../cards/CardPreview";
import { ColorPicker } from "./ColorPicker";
import { Checker, PlayLinks } from "./DeckTile";

export type DeckAction = "rename" | "colour" | "delete" | null;

function cardSummary(card: Card): string {
  const answer = answerText(card.fen, card.answer);
  return card.kind === "move" ? `Answer: ${answer}` : `Line: ${answer}`;
}

type Props = {
  deck: DeckSummary;
  /** Which panel to open straight away, when the person came from a deck's menu. */
  action: DeckAction;
  /** Called when the deck's panel has done its job, to clear the address. */
  onSettled: () => void;
  /** Called after the deck is deleted. */
  onGone: () => void;
};

/** One deck: its banner, its colour and name, and every card in it. */
export function DeckDetail({ deck, action, onSettled, onGone }: Props) {
  const decks = useDecks();
  const cards = useCards(deck.id);
  const color = colorOf(deck);

  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [confirmCard, setConfirmCard] = useState<string | null>(null);
  const [panel, setPanel] = useState<DeckAction>(action);
  const [name, setName] = useState(deck.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function guard(task: () => Promise<void>) {
    setProblem(null);
    try {
      await task();
    } catch {
      setProblem(STORAGE_ERROR);
    }
  }

  function toggle(next: Exclude<DeckAction, null>) {
    setRenameError(null);
    setName(deck.name);
    setPanel((current) => (current === next ? null : next));
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    await guard(async () => {
      const result = await renameDeck(deck.id, name);
      if (result.ok) {
        setPanel(null);
        setRenameError(null);
        onSettled();
      } else {
        setRenameError(result.error);
      }
    });
  }

  async function saveEdit(choice: DeckChoice, draft: CardDraft): Promise<string | null> {
    if (!editing || choice.type !== "existing") return "Pick a deck.";
    try {
      await updateCard({ ...editing, ...draft, deckId: choice.id });
      setOpenId(editing.id);
      setEditing(null);
      return null;
    } catch {
      return STORAGE_ERROR;
    }
  }

  if (editing && decks) {
    return (
      <div>
        <h1 className="text-4xl font-bold sm:text-5xl">Edit card</h1>
        <div className="mt-10">
          <CardEditor mode="edit" initial={cardToDraft(editing)} decks={decks} deckId={editing.deckId} onSave={saveEdit} onCancel={() => setEditing(null)} />
        </div>
      </div>
    );
  }

  const count = deck.cardCount === 1 ? "1 card" : `${deck.cardCount} cards`;
  const note = `deck-empty-${deck.id}`;

  return (
    <div>
      <Link to="/decks" className="inline-flex items-center gap-1 rounded-lg font-semibold text-ink-soft hover:text-ink">
        <ChevronLeftIcon width={20} height={20} />
        All decks
      </Link>

      <header
        className="relative isolate mt-4 rounded-3xl px-6 py-7 text-white shadow-[0_4px_0_rgba(0,0,0,0.22)] sm:px-8"
        style={{ background: gradientOf(color) }}
      >
        <Checker />
        <div className="relative z-10">
          {deck.theme === "tutorial" ? <p className="text-sm font-semibold text-white/90">Starter deck</p> : null}
          <h1 className="text-4xl font-bold sm:text-5xl">{deck.name}</h1>
          {deck.description ? <p className="mt-3 max-w-prose text-lg">{deck.description}</p> : null}
          <p className="mt-3 text-white/90">{count}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <PlayLinks deckId={deck.id} name={deck.name} cardCount={deck.cardCount} describedBy={note} />
          </div>
          {deck.cardCount === 0 ? (
            <p id={note} className="mt-3 text-sm text-white/90">
              This deck has no cards yet.
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="secondary" aria-expanded={panel === "rename"} onClick={() => toggle("rename")}>
          Rename
        </Button>
        <Button variant="secondary" aria-expanded={panel === "colour"} onClick={() => toggle("colour")}>
          Change colour
        </Button>
        <Button variant="secondary" aria-expanded={panel === "delete"} onClick={() => toggle("delete")}>
          Delete deck
        </Button>
      </div>

      {problem ? (
        <div className="mt-5 max-w-xl">
          <Feedback tone="bad" title="That didn't work">
            {problem}
          </Feedback>
        </div>
      ) : null}

      {panel === "rename" ? (
        <form onSubmit={submitRename} className="panel mt-5 flex flex-wrap items-start gap-3 p-5" noValidate>
          <div className="min-w-0 flex-1">
            <label htmlFor="deck-rename" className="block font-display text-lg font-bold">
              Deck name
            </label>
            <input
              id="deck-rename"
              className={`${fieldClass} mt-2`}
              value={name}
              aria-invalid={renameError ? true : undefined}
              aria-describedby={renameError ? "deck-rename-error" : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {renameError ? (
              <p id="deck-rename-error" role="alert" className="mt-2 font-semibold text-bad-edge">
                {renameError}
              </p>
            ) : null}
          </div>
          <div className="flex gap-3 sm:mt-9">
            <Button type="submit">Save name</Button>
            <Button variant="secondary" onClick={() => toggle("rename")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {panel === "colour" ? (
        <div className="panel mt-5 p-5">
          <p className="font-display text-lg font-bold">Deck colour</p>
          <p className="mt-1 text-sm text-ink-soft">The colour shows on the deck's tile, its banner, and behind its cards.</p>
          <div className="mt-4">
            <ColorPicker
              value={color.id}
              onChange={(id) =>
                guard(async () => {
                  const result = await setDeckColor(deck.id, id);
                  if (!result.ok) setProblem(result.error);
                })
              }
            />
          </div>
        </div>
      ) : null}

      {panel === "delete" ? (
        <div className="mt-5">
          <Feedback tone="bad" title={`Delete ${deck.name}?`}>
            <p>This deletes the deck and all {deck.cardCount} of its cards. It can't be undone.</p>
            <div className="mt-4 flex gap-3">
              <Button
                variant="danger"
                onClick={() =>
                  guard(async () => {
                    await deleteDeck(deck.id);
                    onGone();
                  })
                }
              >
                Delete deck
              </Button>
              <Button variant="secondary" onClick={() => toggle("delete")}>
                Keep it
              </Button>
            </div>
          </Feedback>
        </div>
      ) : null}

      {cards === null ? (
        <div className="mt-8">
          <Feedback tone="bad" title="Can't read the cards">
            {STORAGE_ERROR}
          </Feedback>
        </div>
      ) : cards === undefined ? (
        <p className="mt-8 text-ink-soft">Loading cards…</p>
      ) : cards.length === 0 ? (
        <p className="mt-8 text-ink-soft">
          This deck has no cards. Make some on the{" "}
          <Link to="/create" className="font-semibold underline underline-offset-4">
            Create page
          </Link>
          .
        </p>
      ) : (
        <ul
          className="mt-8 space-y-4 rounded-3xl border-2 p-4 sm:p-5"
          style={{ background: color.wash, borderColor: color.line }}
          aria-label={`Cards in ${deck.name}`}
        >
          {cards.map((card) => {
            const open = openId === card.id;
            const category = CATEGORIES.find((option) => option.value === card.category)?.label;
            return (
              <li key={card.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold">{card.prompt}</p>
                    <p className="mt-1 font-mono text-sm text-ink-soft">{cardSummary(card)}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {category}
                      {card.tags.length > 0 ? `, ${card.tags.join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" aria-expanded={open} onClick={() => setOpenId(open ? null : card.id)}>
                      {open ? "Close" : "Open"}
                    </Button>
                    <Button variant="secondary" onClick={() => setEditing(card)}>
                      Edit
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmCard(card.id)}>
                      Delete
                    </Button>
                  </div>
                </div>

                {confirmCard === card.id ? (
                  <div className="mt-4">
                    <Feedback tone="bad" title="Delete this card?">
                      <p>It can't be undone.</p>
                      <div className="mt-4 flex gap-3">
                        <Button
                          variant="danger"
                          onClick={() =>
                            guard(async () => {
                              await deleteCard(card.id);
                              setConfirmCard(null);
                              if (openId === card.id) setOpenId(null);
                            })
                          }
                        >
                          Delete card
                        </Button>
                        <Button variant="secondary" onClick={() => setConfirmCard(null)}>
                          Keep it
                        </Button>
                      </div>
                    </Feedback>
                  </div>
                ) : null}

                {open ? (
                  <div className="mt-6 border-t-2 border-line pt-6">
                    <CardPreview card={card} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
