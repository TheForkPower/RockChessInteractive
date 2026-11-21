import { useState } from "react";
import { Link } from "react-router";
import type { BoardColor } from "cm-chessboard/src/Chessboard.js";
import { Board } from "../../board/Board";
import { addCards, createDeck, STORAGE_ERROR } from "../../data/repo";
import { useDecks } from "../../data/hooks";
import { draftFromPosition, type CardDraft } from "../../domain/cards";
import { START_FEN } from "../../domain/fen";
import { Game, describeStatus, type MoveInput } from "../../domain/game";
import {
  addMove,
  createTree,
  deleteFrom,
  getNode,
  graft,
  mainlineFrom,
  moveLabel,
  parseMovetext,
  parsePgn,
  type LineTree,
  type PgnGame,
} from "../../domain/pgn";
import { MoveTree } from "../../moves/MoveTree";
import { StepButtons } from "../../moves/StepButtons";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { PageHeader } from "../../ui/PageHeader";
import { Segmented } from "../../ui/Segmented";
import { CardEditor, type DeckChoice } from "../cards/CardEditor";
import { DeckBuilder } from "./DeckBuilder";
import { PgnPanel, PositionPanel } from "./SourcePanels";

type Mode = "find" | "card" | "deck";
type Source = { title: string; pgn: string; headers: Record<string, string> } | null;
type Notice = { title: string; body?: string; deckId: string } | null;

function parseForPanel(text: string): { games: PgnGame[] } | { error: string } {
  const parsed = parsePgn(text);
  return parsed.ok ? { games: parsed.games } : { error: parsed.error };
}

export function CreatePage() {
  const [tree, setTree] = useState<LineTree>(() => createTree());
  const [currentId, setCurrentId] = useState(tree.rootId);
  const [orientation, setOrientation] = useState<BoardColor>("w");
  const [source, setSource] = useState<Source>(null);
  const [tab, setTab] = useState<"position" | "pgn">("position");
  const [mode, setMode] = useState<Mode>("find");
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const decks = useDecks();

  const current = getNode(tree, currentId);
  const status = describeStatus(new Game(current.fen));
  const hasMoves = getNode(tree, tree.rootId).childIds.length > 0;

  /** The position a card made right now would start from: here, or one step back at the end of a line. */
  const anchorId = current.childIds.length > 0 ? current.id : current.parentId;
  const anchor = anchorId ? getNode(tree, anchorId) : null;

  function show(nextTree: LineTree, id: string) {
    setTree(nextTree);
    setCurrentId(id);
  }

  function goTo(id: string | null | undefined) {
    if (id) setCurrentId(id);
  }

  function playOnBoard(move: MoveInput): boolean {
    const added = addMove(tree, currentId, move);
    if (!added) return false;
    show(added.tree, added.id);
    return true;
  }

  function setFen(fen: string) {
    show(createTree(fen), "n0");
    setSource(null);
  }

  function startAgain() {
    show(createTree(), "n0");
    setSource(null);
  }

  function addTypedMoves(text: string): string | null {
    const parsed = parseMovetext(text, current.fen);
    if (!parsed.ok) return parsed.error;
    if (getNode(parsed.tree, parsed.tree.rootId).childIds.length === 0) return "Enter some moves, such as 1. e4 e5.";
    const joined = graft(tree, currentId, parsed.tree);
    show(joined.tree, joined.endId);
    return null;
  }

  function loadGame(game: PgnGame, text: string) {
    show(game.tree, game.tree.rootId);
    setSource({ title: game.title, pgn: text, headers: game.headers });
    setOrientation("w");
  }

  function deleteMove() {
    if (current.parentId === null) return;
    show(deleteFrom(tree, currentId), current.parentId);
  }

  function makeCard() {
    if (!anchor) return;
    const result = draftFromPosition(tree, anchor.id, { kind: "move" });
    if (!result.ok) return setCardError(result.error);
    setCardError(null);
    setNotice(null);
    setCardDraft(result.draft);
    setMode("card");
  }

  async function resolveDeck(choice: DeckChoice): Promise<{ id: string; name: string } | string> {
    if (choice.type === "existing") {
      const deck = decks?.find((item) => item.id === choice.id);
      return deck ? { id: deck.id, name: deck.name } : "That deck no longer exists.";
    }
    const made = await createDeck(choice.name);
    return made.ok ? { id: made.deck.id, name: made.deck.name } : made.error;
  }

  async function saveCards(choice: DeckChoice, drafts: CardDraft[]): Promise<string | null> {
    try {
      const deck = await resolveDeck(choice);
      if (typeof deck === "string") return deck;
      const result = await addCards(deck.id, drafts, source ?? undefined);
      if (result.added === 0) {
        return drafts.length === 1
          ? `${deck.name} already has a card with that position and answer.`
          : `Every one of those cards is already in ${deck.name}.`;
      }
      const cards = result.added === 1 ? "1 card" : `${result.added} cards`;
      setNotice({
        title: `Saved ${cards} to ${deck.name}`,
        body: result.skipped > 0 ? `${result.skipped} already in the deck, so they were left out.` : undefined,
        deckId: deck.id,
      });
      setMode("find");
      setCardDraft(null);
      return null;
    } catch {
      return STORAGE_ERROR;
    }
  }

  if (decks === null && mode !== "find") {
    return (
      <div>
        <PageHeader title="Create cards" />
        <div className="mt-8 max-w-xl">
          <Feedback tone="bad" title="Can't reach storage">
            {STORAGE_ERROR}
          </Feedback>
        </div>
      </div>
    );
  }

  if (mode === "card" && cardDraft) {
    return (
      <div>
        <PageHeader title="Make a card">
          Set the question and the answer, then add an explanation and the moves that follow.
        </PageHeader>
        <div className="mt-10">
          {decks === undefined ? (
            <p className="text-ink-soft">Loading your decks…</p>
          ) : (
            <CardEditor
              mode="new"
              initial={cardDraft}
              decks={decks ?? []}
              onSave={(choice, draft) => saveCards(choice, [draft])}
              onCancel={() => setMode("find")}
            />
          )}
        </div>
      </div>
    );
  }

  const board = (
    <div>
      <Board
        fen={current.fen}
        orientation={orientation}
        interactive={mode === "find" ? "turn" : false}
        onMove={mode === "find" ? playOnBoard : undefined}
        lastMove={current.from && current.to ? { from: current.from, to: current.to } : null}
        label="Chessboard. Drag a piece or click two squares to play a move."
      />
      <p className="mt-3 text-lg font-semibold" aria-live="polite">
        {status}
      </p>
      <div className="mt-3">
        <StepButtons
          canBack={current.parentId !== null}
          canForward={current.childIds.length > 0}
          onStart={() => goTo(tree.rootId)}
          onBack={() => goTo(current.parentId)}
          onForward={() => goTo(current.childIds[0])}
          onEnd={() => {
            const rest = mainlineFrom(tree, currentId);
            goTo(rest.length > 0 ? rest[rest.length - 1] : currentId);
          }}
        />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={() => setOrientation((side) => (side === "w" ? "b" : "w"))}>
          Flip board
        </Button>
        <Button variant="secondary" disabled={current.parentId === null || mode !== "find"} onClick={deleteMove}>
          Delete move
        </Button>
      </div>
    </div>
  );

  if (mode === "deck") {
    return (
      <div>
        <PageHeader title="Create cards" />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-6 lg:self-start">{board}</div>
          {decks === undefined ? (
            <p className="text-ink-soft">Loading your decks…</p>
          ) : (
            <DeckBuilder
              tree={tree}
              currentId={currentId}
              decks={decks ?? []}
              onBuild={saveCards}
              onCancel={() => setMode("find")}
            />
          )}
        </div>
      </div>
    );
  }

  const anchorLabel =
    anchor === null
      ? ""
      : anchor.parentId === null
        ? tree.startFen === START_FEN
          ? "the starting position"
          : "the position you set up"
        : `the position after ${moveLabel(tree, anchor.id)}`;

  return (
    <div>
      <PageHeader title="Create cards">
        Paste a PGN, set up a position with a FEN, or play the moves on the board. Then make one card, or a deck from the whole line.
      </PageHeader>

      {notice ? (
        <div className="mt-8 max-w-2xl">
          <Feedback tone="good" title={notice.title}>
            {notice.body ? <p>{notice.body}</p> : null}
            <p className="mt-2">
              <Link to={`/decks?deck=${notice.deckId}`} className="font-semibold underline underline-offset-4">
                View the deck
              </Link>
            </p>
          </Feedback>
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">{board}</div>

        <div className="space-y-10">
          <section aria-labelledby="source-heading">
            <h2 id="source-heading" className="sr-only">
              Where the position comes from
            </h2>
            <Segmented
              label="Where the position comes from"
              value={tab}
              onChange={setTab}
              options={[
                { value: "position", label: "FEN and moves" },
                { value: "pgn", label: "Paste a PGN" },
              ]}
            />
            <div className="mt-6">
              {tab === "position" ? (
                <PositionPanel fen={current.fen} onSetFen={setFen} onStart={startAgain} onAddMoves={addTypedMoves} />
              ) : (
                <PgnPanel parse={parseForPanel} onLoad={loadGame} />
              )}
            </div>
          </section>

          <section aria-labelledby="moves-heading">
            <h2 id="moves-heading" className="font-display text-lg font-bold">
              The line so far
            </h2>
            {hasMoves ? (
              <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border-2 border-line bg-surface p-4">
                <MoveTree
                  tree={tree}
                  selectedId={currentId === tree.rootId ? null : currentId}
                  onSelect={(id) => goTo(id)}
                  label="Moves in this line"
                />
              </div>
            ) : (
              <p className="mt-1 text-ink-soft">No moves yet. Play on the board, type some moves, or paste a PGN.</p>
            )}
          </section>

          <section aria-labelledby="make-heading" className="panel p-6">
            <h2 id="make-heading" className="font-display text-xl font-bold">
              Make cards
            </h2>
            {anchor ? (
              <p className="mt-2 text-ink-soft">
                A card from {anchorLabel}: you find {moveLabel(tree, anchor.childIds[0])}.
              </p>
            ) : (
              <p className="mt-2 text-ink-soft">
                Play a move first. A card needs a position and the move that follows it.
              </p>
            )}
            {cardError ? (
              <p role="alert" className="mt-2 font-semibold text-bad-edge">
                {cardError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={!anchor} onClick={makeCard}>
                Make a card
              </Button>
              <Button
                variant="secondary"
                disabled={!hasMoves}
                onClick={() => {
                  setNotice(null);
                  setMode("deck");
                }}
              >
                Make a deck from this line
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
