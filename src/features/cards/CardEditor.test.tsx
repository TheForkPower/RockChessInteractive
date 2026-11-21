import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { draftFromPosition, type CardDraft } from "../../domain/cards";
import { getNode, mainlineFrom, parseMovetext } from "../../domain/pgn";
import { START_FEN } from "../../domain/fen";

vi.mock("../../board/Board", async () => await import("../../test/boardMock"));

import { CardEditor } from "./CardEditor";

function draft(text = "1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 3. Bb5 a6"): CardDraft {
  const parsed = parseMovetext(text, START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const made = draftFromPosition(parsed.tree, parsed.tree.rootId, { kind: "move" });
  if (!made.ok) throw new Error(made.error);
  return made.draft;
}

const decks = [{ id: "d1", name: "Open", cardCount: 4, dueCount: 0, newCount: 4, learningCount: 0, masteredCount: 0, createdAt: 1, updatedAt: 1 }];
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;

function setup(initial: CardDraft = draft()) {
  const onSave = vi.fn().mockResolvedValue(null);
  const onCancel = vi.fn();
  render(<CardEditor mode="new" initial={initial} decks={decks} onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

describe("CardEditor", () => {
  it("starts from the draft", () => {
    setup();
    expect(input("Question").value).toBe("White to move.");
    expect(input("Answer").value).toBe("1. e4");
    expect(input("Explanation (optional)").value).toBe("");
    expect(input("Deck").value).toBe("d1");
  });

  it("has one box for the explanation, and no separate continuation or notes", () => {
    setup();
    expect(screen.getAllByRole("textbox", { name: /Explanation/ })).toHaveLength(1);
    expect(screen.queryByRole("textbox", { name: /Continuation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Notes/ })).not.toBeInTheDocument();
  });

  it("keeps the less used fields under More options", async () => {
    setup();
    expect(screen.queryByLabelText("Hint (optional)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tags (optional)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByLabelText("Hint (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Other accepted moves (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Type of position")).toBeInTheDocument();
    expect(screen.getByLabelText("Tags (optional)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fewer options" }));
    expect(screen.queryByLabelText("Hint (optional)")).not.toBeInTheDocument();
  });

  it("opens More options when the card already has a hint, tags or another type", () => {
    setup({ ...draft(), hint: "Think centre." });
    expect(input("Hint (optional)").value).toBe("Think centre.");
  });

  it("doesn't ask for a deck when it is already decided", () => {
    render(<CardEditor mode="new" initial={draft()} decks={decks} deckId="d1" fixedDeck onSave={async () => null} onCancel={() => {}} />);
    expect(screen.queryByLabelText("Deck")).not.toBeInTheDocument();
  });

  it("previews the continuation with clickable moves, variations included", () => {
    setup();
    expect(screen.getByRole("button", { name: "2. Bc4" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1. e4" }));
    expect(screen.getByTestId("board")).toHaveAttribute("data-fen", expect.stringContaining("4P3"));
  });

  it("keeps the line the card came from when the answer still starts it", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect((onSave.mock.calls[0][1] as CardDraft).continuation).toBe("1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 3. Bb5 a6");
  });

  it("follows the answer instead once it no longer starts the saved line", async () => {
    const { onSave } = setup();
    change("Answer", "d4");
    expect(screen.getByRole("button", { name: "1. d4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2. Bc4" })).not.toBeInTheDocument();
    expect(screen.getByText(/no longer starts with it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect((onSave.mock.calls[0][1] as CardDraft).continuation).toBe("");
  });

  it("shows the answer on the back of a card made from scratch, and saves no continuation", async () => {
    const { onSave } = setup({ ...draft(), continuation: "" });
    expect(screen.getByRole("button", { name: "1. e4" })).toBeInTheDocument();
    change("Answer", "d4");
    expect(screen.getByRole("button", { name: "1. d4" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect((onSave.mock.calls[0][1] as CardDraft).continuation).toBe("");
  });

  it("folds an old card's notes into its explanation", async () => {
    const { onSave } = setup({ ...draft(), explanation: "Claim the centre.", notes: "Most common." });
    expect(input("Explanation (optional)").value).toBe("Claim the centre.\n\nMost common.");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    const saved = onSave.mock.calls[0][1] as CardDraft;
    expect(saved.explanation).toBe("Claim the centre.\n\nMost common.");
    expect(saved.notes).toBe("");
  });

  it("switches to a line card, offering the first six moves of the line", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Recall a line" }));
    expect(input("Answer line").value).toBe("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6");
    expect(screen.getByRole("radio", { name: "White" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Find one move" }));
    expect(input("Answer").value).toBe("1. e4");
  });

  it("saves a line card for the side chosen", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Recall a line" }));
    await userEvent.click(screen.getByRole("radio", { name: "Black" }));
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [choice, saved] = onSave.mock.calls[0];
    expect(choice).toEqual({ type: "existing", id: "d1" });
    expect(saved).toMatchObject({ kind: "line", side: "b" });
    expect(saved.answer.map((move: { san: string }) => move.san)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  });

  it("insists a one-move card has one move", () => {
    setup();
    change("Answer", "e4 e5");
    expect(screen.getByText(/needs exactly one move/)).toBeInTheDocument();
  });

  it("reads other accepted moves, drops repeats of the answer, and rejects illegal ones", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    change("Other accepted moves (optional)", "d4, e4, c4");
    expect(screen.queryByText(/isn't a legal move/)).not.toBeInTheDocument();
    change("Other accepted moves (optional)", "d4, Qh5");
    expect(screen.getByText('"Qh5" isn\'t a legal move in this position.')).toBeInTheDocument();
  });

  it("saves the text fields, tags and extra moves", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    change("Question", " What does White play? ");
    change("Hint (optional)", "Think centre.");
    change("Other accepted moves (optional)", "d4, c4");
    change("Explanation (optional)", "Claim the centre.");
    change("Tags (optional)", "kings pawn, basics, Basics");
    await userEvent.selectOptions(input("Type of position"), "strategy");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    const saved = onSave.mock.calls[0][1] as CardDraft;
    expect(saved).toMatchObject({
      prompt: "What does White play?",
      hint: "Think centre.",
      explanation: "Claim the centre.",
      notes: "",
      tags: ["kings pawn", "basics"],
      category: "strategy",
      kind: "move",
      side: "w",
    });
    expect(saved.alternatives.map((move) => move.san)).toEqual(["d4", "c4"]);
    expect(saved.continuation).toBe("1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 3. Bb5 a6");
  });

  it("asks for a question", async () => {
    const { onSave } = setup();
    change("Question", " ");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(screen.getByText("Write what the card asks.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows a save problem and stays open", async () => {
    const onSave = vi.fn().mockResolvedValue("The deck is full.");
    render(<CardEditor mode="new" initial={draft()} decks={decks} onSave={onSave} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(await screen.findByText("The deck is full.")).toBeInTheDocument();
  });

  it("cancels", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("asks for a new deck's name when there are no decks", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<CardEditor mode="new" initial={draft()} decks={[]} onSave={onSave} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(screen.getByText("Give the new deck a name.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New deck name"), "Fresh");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(onSave.mock.calls[0][0]).toEqual({ type: "new", name: "Fresh" });
  });

  it("works for a Black card whose position is after White's move", () => {
    const parsed = parseMovetext("1. e4 e5 2. Nf3", START_FEN);
    if (!parsed.ok) throw new Error(parsed.error);
    const e4 = mainlineFrom(parsed.tree, parsed.tree.rootId)[0];
    const made = draftFromPosition(parsed.tree, e4, { kind: "move" });
    if (!made.ok) throw new Error(made.error);
    render(<CardEditor mode="edit" initial={made.draft} decks={decks} deckId="d1" onSave={async () => null} onCancel={() => {}} />);
    expect(input("Question").value).toBe("Black to move.");
    expect(input("Answer").value).toBe("1... e5");
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "b");
    expect(getNode(parsed.tree, e4).san).toBe("e4");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "New deck…" })).not.toBeInTheDocument();
  });
});
