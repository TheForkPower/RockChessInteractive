import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { STORAGE_ERROR } from "../../data/repo";
import { useDecks } from "../../data/hooks";
import { restoreTutorialDeck } from "../../data/seed";
import { TUTORIAL_DECK_NAME } from "../../data/tutorialDeck";
import { Button } from "../../ui/Button";
import { Feedback } from "../../ui/Feedback";
import { PageHeader } from "../../ui/PageHeader";
import { DeckDetail, type DeckAction } from "./DeckDetail";
import { DeckTile, DifficultStrip } from "./DeckTile";

const ACTIONS: DeckAction[] = ["rename", "colour", "delete"];

export function DecksPage() {
  const [params, setParams] = useSearchParams();
  const decks = useDecks();
  const [problem, setProblem] = useState<string | null>(null);

  const requested = params.get("deck");
  const deck = decks?.find((item) => item.id === requested) ?? null;
  const asked = params.get("do") as DeckAction;
  const action = ACTIONS.includes(asked) ? asked : null;

  async function addStarterDeck() {
    setProblem(null);
    try {
      await restoreTutorialDeck();
    } catch {
      setProblem(STORAGE_ERROR);
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

  if (deck) {
    return (
      <DeckDetail
        key={`${deck.id}-${action ?? ""}`}
        deck={deck}
        action={action}
        onSettled={() => setParams({ deck: deck.id })}
        onGone={() => setParams({})}
      />
    );
  }

  const hasStarter = decks.some((item) => item.theme === "tutorial");
  const difficult = decks.find((item) => item.theme === "difficult");
  const regular = decks.filter((item) => item.theme !== "difficult");

  return (
    <div>
      <PageHeader title="Decks">
        {regular.length === 0
          ? "You have no decks yet. A deck appears when you save your first card."
          : "Each deck is a pack of cards. Press Review or Learn to play one, or open it to see and edit its cards."}
      </PageHeader>

      {problem ? (
        <div className="mt-6 max-w-xl">
          <Feedback tone="bad" title="That didn't work">
            {problem}
          </Feedback>
        </div>
      ) : null}

      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {regular.map((item) => (
          <DeckTile key={item.id} deck={item} />
        ))}
        <li className="flex">
          <Link
            to="/create"
            className="flex min-h-[11.5rem] w-full flex-col justify-center rounded-3xl border-2 border-dashed border-line-strong p-6 text-ink-soft transition-colors hover:border-brand hover:bg-brand-wash hover:text-brand"
          >
            <span className="font-display text-2xl font-bold">Make cards</span>
            <span className="mt-1">Paste a PGN or set up a position, then save it as a deck.</span>
          </Link>
        </li>
      </ul>

      {hasStarter ? null : (
        <div className="mt-8">
          <Button variant="secondary" onClick={addStarterDeck}>
            Add the {TUTORIAL_DECK_NAME} deck
          </Button>
        </div>
      )}

      {difficult ? <DifficultStrip deck={difficult} /> : null}
    </div>
  );
}
