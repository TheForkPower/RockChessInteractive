import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { deleteCard, deleteDeck, renameDeck, STORAGE_ERROR, updateCard } from "../../data/repo";
import { useCards, useDecks } from "../../data/hooks";
import { answerText, CATEGORIES, cardToDraft, type Card, type CardDraft } from "../../domain/cards";
import { Button, ButtonLink } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { fieldClass } from "../../ui/Field";
import { PageHeader } from "../../ui/PageHeader";
import { CardEditor, type DeckChoice } from "../cards/CardEditor";
import { CardPreview } from "../cards/CardPreview";

function cardSummary(card: Card): string {
  const answer = answerText(card.fen, card.answer);
  return card.kind === "move" ? `Answer: ${answer}` : `Line: ${answer}`;
}

export function DecksPage() {
  const [params, setParams] = useSearchParams();
  const decks = useDecks();
  const requested = params.get("deck");
  const deck = decks?.find((item) => item.id === requested) ?? decks?.[0] ?? null;
  const cards = useCards(deck?.id ?? null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [confirmCard, setConfirmCard] = useState<string | null>(null);
  const [confirmDeck, setConfirmDeck] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function guard(action: () => Promise<void>) {
    setProblem(null);
    try {
      await action();
    } catch {
      setProblem(STORAGE_ERROR);
    }
  }

  function pickDeck(id: string) {
    setParams({ deck: id });
    setOpenId(null);
    setEditing(null);
    setConfirmCard(null);
    setConfirmDeck(false);
    setRenaming(null);
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!deck || renaming === null) return;
    await guard(async () => {
      const result = await renameDeck(deck.id, renaming);
      if (result.ok) {
        setRenaming(null);
        setRenameError(null);
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

  if (decks === null) {
    return (
      <div>
        <PageHeader title="Decks" />
        <div className="mt-8 max-w-xl">
          <Feedback tone="bad" title="Can't reach storage">
            {STORAGE_ERROR}
          </Feedback>
        </div>
      </div>
    );
  }

  if (decks === undefined) {
    return (
      <div>
        <PageHeader title="Decks" />
        <p className="mt-8 text-ink-soft">Loading your decks…</p>
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <div>
        <PageHeader title="Decks">You have no decks yet. A deck appears when you save your first card.</PageHeader>
        <div className="mt-8">
          <ButtonLink to="/create" size="lg">
            Create cards
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (editing && deck) {
    return (
      <div>
        <PageHeader title="Edit card" />
        <div className="mt-10">
          <CardEditor mode="edit" initial={cardToDraft(editing)} decks={decks} deckId={editing.deckId} onSave={saveEdit} onCancel={() => setEditing(null)} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Decks">Your saved cards. Open one to follow its moves, edit it, or delete it.</PageHeader>

      {problem ? (
        <div className="mt-6 max-w-xl">
          <Feedback tone="bad" title="That didn't work">
            {problem}
          </Feedback>
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Decks">
          <ul className="space-y-2">
            {decks.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === deck?.id ? "true" : undefined}
                  onClick={() => pickDeck(item.id)}
                  className={[
                    "flex w-full items-baseline justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                    item.id === deck?.id ? "border-brand bg-brand-wash" : "border-line bg-surface hover:bg-line/40",
                  ].join(" ")}
                >
                  <span className="font-display font-bold">{item.name}</span>
                  <span className="text-sm text-ink-soft">{item.cardCount}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <ButtonLink to="/create" variant="secondary">
              Create cards
            </ButtonLink>
          </div>
        </nav>

        {deck ? (
          <section aria-labelledby="deck-heading" className="min-w-0">
            {renaming !== null ? (
              <form onSubmit={submitRename} className="flex flex-wrap items-start gap-3" noValidate>
                <div className="min-w-0 flex-1">
                  <label htmlFor="deck-rename" className="sr-only">
                    Deck name
                  </label>
                  <input
                    id="deck-rename"
                    className={fieldClass}
                    value={renaming}
                    aria-invalid={renameError ? true : undefined}
                    onChange={(event) => setRenaming(event.target.value)}
                  />
                  {renameError ? (
                    <p role="alert" className="mt-2 font-semibold text-bad-edge">
                      {renameError}
                    </p>
                  ) : null}
                </div>
                <Button type="submit">Save name</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRenaming(null);
                    setRenameError(null);
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 id="deck-heading" className="text-3xl font-bold">
                    {deck.name}
                  </h2>
                  <p className="mt-1 text-ink-soft">{deck.cardCount === 1 ? "1 card" : `${deck.cardCount} cards`}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => setRenaming(deck.name)}>
                    Rename
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmDeck(true)}>
                    Delete deck
                  </Button>
                </div>
              </div>
            )}

            {confirmDeck ? (
              <div className="mt-5">
                <Feedback tone="bad" title={`Delete ${deck.name}?`}>
                  <p>This deletes the deck and all {deck.cardCount} of its cards. It can't be undone.</p>
                  <div className="mt-4 flex gap-3">
                    <Button
                      variant="danger"
                      onClick={() =>
                        guard(async () => {
                          await deleteDeck(deck.id);
                          setConfirmDeck(false);
                          setParams({});
                          setOpenId(null);
                        })
                      }
                    >
                      Delete deck
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmDeck(false)}>
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
              <p className="mt-8 text-ink-soft">This deck has no cards. Make some on the Create page.</p>
            ) : (
              <ul className="mt-8 space-y-4">
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
          </section>
        ) : null}
      </div>
    </div>
  );
}
