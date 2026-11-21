import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { backupFileName, exportBackup } from "../../data/backup";
import { markDifficult } from "../../data/difficult";
import { downloadText } from "../../data/download";
import { deleteCard, deleteDeck, moveCard, renameDeck, setDeckColor, STORAGE_ERROR, updateCard, type DeckSummary } from "../../data/repo";
import { useCards, useDecks, useSchedules } from "../../data/hooks";
import { answerText, CATEGORIES, cardToDraft, type Card, type CardDraft } from "../../domain/cards";
import { colorOf, gradientOf } from "../../domain/deckColors";
import { cardStatus, dueLabel } from "../../domain/scheduling";
import { hasTag, matchesQuery, tagsOf } from "../../domain/search";
import { Button, ButtonLink } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { fieldClass } from "../../ui/Field";
import { ChevronLeftIcon } from "../../ui/Icons";
import { Menu } from "../../ui/Menu";
import { CardEditor, type DeckChoice } from "../cards/CardEditor";
import { CardPreview } from "../cards/CardPreview";
import { CardProgress } from "./CardProgress";
import { ColorPicker } from "./ColorPicker";
import { DeckStats, type StatusFilter } from "./DeckStats";
import { Checker, PlayLinks } from "./DeckTile";
import { progressLine } from "./progressLine";

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
  /** A card to open straight away, when the person came from a search result. */
  openCard?: string | null;
};

/** One deck: its banner, its colour and name, and every card in it. */
export function DeckDetail({ deck, action, onSettled, onGone, openCard = null }: Props) {
  const decks = useDecks();
  const cards = useCards(deck.id);
  const schedules = useSchedules(deck.id);
  const [now] = useState(() => Date.now());
  const color = colorOf(deck);

  const [openId, setOpenId] = useState<string | null>(openCard);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [confirmCard, setConfirmCard] = useState<string | null>(null);
  const [panel, setPanel] = useState<DeckAction>(action);
  const [name, setName] = useState(deck.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});

  // Coming from a search result, bring the card into view once the list has loaded.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!openCard || !cards || scrolled.current) return;
    scrolled.current = true;
    document.getElementById(`card-${openCard}`)?.scrollIntoView?.({ block: "center" });
  }, [openCard, cards]);

  async function guard(task: () => Promise<void>) {
    setProblem(null);
    try {
      await task();
    } catch {
      setProblem(STORAGE_ERROR);
    }
  }

  async function addToDifficult(card: Card) {
    await guard(async () => {
      const result = await markDifficult(card);
      setMarks((previous) => ({
        ...previous,
        [card.id]: result === "already" ? "Already in Difficult moves." : "Added to Difficult moves.",
      }));
    });
  }

  async function exportDeck() {
    await guard(async () => {
      const backup = await exportBackup(deck.id);
      downloadText(backupFileName(backup), JSON.stringify(backup));
    });
  }

  function startMove(card: Card) {
    setMoving(card.id);
    setMoveError(null);
    setMoveTo(decks?.find((item) => item.theme !== "difficult" && item.id !== deck.id)?.id ?? "");
  }

  async function submitMove(card: Card) {
    if (!moveTo) return setMoveError("Pick a deck to move it to.");
    await guard(async () => {
      const result = await moveCard(card.id, moveTo);
      if (result.ok) {
        setMoving(null);
        setMoveError(null);
        if (openId === card.id) setOpenId(null);
      } else {
        setMoveError(result.error);
      }
    });
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
  const otherDecks = (decks ?? []).filter((item) => item.theme !== "difficult" && item.id !== deck.id);
  const filtering = query.trim() !== "" || tag !== null || status !== null;
  const shownCards = (cards ?? []).filter((card) => {
    if (!matchesQuery(card, query)) return false;
    if (tag && !hasTag(card, tag)) return false;
    if (!status) return true;
    const schedule = schedules?.[card.id];
    return status === "due" ? Boolean(schedule && schedule.due <= now) : cardStatus(schedule) === status;
  });
  const tags = tagsOf(cards ?? []);
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
          {deck.theme === "difficult" ? <p className="text-sm font-semibold text-white/90">Fills itself as you practise</p> : null}
          <h1 className="text-4xl font-bold sm:text-5xl">{deck.name}</h1>
          {deck.description ? <p className="mt-3 max-w-prose text-lg">{deck.description}</p> : null}
          <p className="mt-3 text-white/90">
            {count}
            {deck.cardCount > 0 ? <span>{`. ${progressLine(deck)}.`}</span> : null}
          </p>
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

      {deck.theme === "difficult" ? null : (
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink to={`/create?deck=${deck.id}`}>Add a card</ButtonLink>
          <ButtonLink to={`/create?deck=${deck.id}&from=pgn`} variant="secondary">
            Add from a PGN
          </ButtonLink>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="secondary" aria-expanded={panel === "rename"} onClick={() => toggle("rename")}>
          Rename
        </Button>
        <Button variant="secondary" aria-expanded={panel === "colour"} onClick={() => toggle("colour")}>
          Change colour
        </Button>
        <Button variant="secondary" onClick={() => void exportDeck()}>
          Export deck
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

      {cards && cards.length > 0 ? (
        <div className="mt-8 space-y-5">
          <DeckStats deck={deck} active={status} onChange={setStatus} />
          <div className="max-w-xl">
            <label htmlFor="deck-search" className="block font-display text-lg font-bold">
              Search this deck
            </label>
            <input
              id="deck-search"
              type="search"
              className={`${fieldClass} mt-2`}
              value={query}
              placeholder="A move, a word, a tag"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {tags.length > 0 ? (
            <div role="group" aria-label="Tags" className="flex flex-wrap gap-2">
              {tags.map((item) => {
                const on = tag !== null && tag.toLowerCase() === item.toLowerCase();
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTag(on ? null : item)}
                    className={[
                      "rounded-full border-2 px-3 py-1 text-sm font-semibold transition-colors",
                      on ? "border-brand bg-brand-wash text-brand" : "border-line-strong bg-surface text-ink hover:bg-line/40",
                    ].join(" ")}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          ) : null}
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
        deck.theme === "difficult" ? (
          <p className="mt-8 max-w-xl text-ink-soft">
            Nothing here yet. A card lands here when you need the answer or get it wrong twice. You can also add one from any
            other deck with Mark as difficult.
          </p>
        ) : (
          <p className="mt-8 max-w-xl text-ink-soft">
            Nothing in here yet. Add a card to make the first one, or build cards from a PGN.
          </p>
        )
      ) : shownCards.length === 0 ? (
        <p className="mt-8 text-ink-soft">
          No cards match.{" "}
          {filtering ? (
            <button
              type="button"
              className="font-semibold underline underline-offset-4"
              onClick={() => {
                setQuery("");
                setTag(null);
                setStatus(null);
              }}
            >
              Clear the search
            </button>
          ) : null}
        </p>
      ) : (
        <ul
          className="mt-8 space-y-4 rounded-3xl border-2 p-4 sm:p-5"
          style={{ background: color.wash, borderColor: color.line }}
          aria-label={`Cards in ${deck.name}`}
        >
          {shownCards.map((card) => {
            const open = openId === card.id;
            const category = CATEGORIES.find((option) => option.value === card.category)?.label;
            return (
              <li key={card.id} id={`card-${card.id}`} className="panel p-5">
                <div className="grid min-h-[7.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-display text-lg font-bold">{card.prompt}</p>
                    <p className="mt-1 truncate font-mono text-sm text-ink-soft">{cardSummary(card)}</p>
                    <p className="mt-1 truncate text-sm text-ink-soft">
                      {schedules ? <span className="font-semibold">{schedules[card.id] ? dueLabel(schedules[card.id].due, now) : "New"}. </span> : null}
                      {category}
                      {card.tags.length > 0 ? `, ${card.tags.join(", ")}` : ""}
                    </p>
                    {deck.theme === "difficult" && card.struggles ? (
                      <p className="mt-1 text-sm font-semibold text-ink-soft">
                        Gave trouble {card.struggles === 1 ? "once" : `${card.struggles} times`}
                      </p>
                    ) : null}
                    {marks[card.id] ? (
                      <p role="status" className="mt-1 text-sm font-semibold text-ink-soft">
                        {marks[card.id]}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" className="min-w-28" aria-expanded={open} onClick={() => setOpenId(open ? null : card.id)}>
                      {open ? "Close" : "Open"}
                    </Button>
                    <Menu
                      label={`More options for ${cardSummary(card)}`}
                      items={[
                        { label: "Edit", onSelect: () => setEditing(card) },
                        ...(deck.theme === "difficult"
                          ? []
                          : [
                              { label: "Move to another deck", onSelect: () => startMove(card) },
                              { label: "Mark as difficult", onSelect: () => void addToDifficult(card) },
                            ]),
                        { label: "Delete", danger: true, onSelect: () => setConfirmCard(card.id) },
                      ]}
                    />
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

                {moving === card.id ? (
                  <div className="mt-4 rounded-2xl bg-brand-wash p-4">
                    {otherDecks.length === 0 ? (
                      <>
                        <p className="font-semibold">There is no other deck to move it to. Make one on the Decks page first.</p>
                        <div className="mt-3">
                          <Button variant="secondary" onClick={() => setMoving(null)}>
                            Close
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <label htmlFor={`move-${card.id}`} className="block font-display text-lg font-bold">
                          Move to
                        </label>
                        <select
                          id={`move-${card.id}`}
                          className={`${fieldClass} mt-2 max-w-sm`}
                          value={moveTo}
                          onChange={(event) => setMoveTo(event.target.value)}
                        >
                          {otherDecks.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.cardCount})
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-sm text-ink-soft">Its progress goes with it.</p>
                        {moveError ? (
                          <p role="alert" className="mt-2 font-semibold text-bad-edge">
                            {moveError}
                          </p>
                        ) : null}
                        <div className="mt-3 flex gap-3">
                          <Button onClick={() => void submitMove(card)}>Move card</Button>
                          <Button variant="secondary" onClick={() => setMoving(null)}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {open ? (
                  <div className="mt-6 border-t-2 border-line pt-6">
                    <CardPreview card={card} />
                    <CardProgress cardId={card.id} schedule={schedules?.[card.id]} />
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
