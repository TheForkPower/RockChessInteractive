import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportBackup } from "../../data/backup";
import { db } from "../../data/db";
import { addCards, createDeck } from "../../data/repo";
import { buildDeckCards } from "../../domain/cards";
import { START_FEN } from "../../domain/fen";
import { parseMovetext } from "../../domain/pgn";
import { getSettings } from "../../data/progress";
import { DEFAULT_SETTINGS } from "../../domain/settings";
import { SettingsPage } from "./SettingsPage";

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("Settings", () => {
  it("shows the defaults to begin with", async () => {
    renderSettings();
    expect(await screen.findByRole("radio", { name: "90%" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "30 s" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "10" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("radio", { name: "On" })[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Manual" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches between manual and smart grading", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("radio", { name: "Smart" }));
    await waitFor(async () => expect((await getSettings()).grading).toBe("smart"));
    expect(await screen.findByText(/The app picks the grade/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Manual" }));
    await waitFor(async () => expect((await getSettings()).grading).toBe("manual"));
    expect(await screen.findByText(/You press Again, Hard, Good or Easy/)).toBeInTheDocument();
  });

  it("saves a change and keeps it", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("radio", { name: "95%" }));
    await waitFor(async () => expect((await getSettings()).desiredRetention).toBe(0.95));
    await userEvent.click(screen.getByRole("radio", { name: "Off" }));
    await userEvent.click(screen.getByRole("radio", { name: "2 min" }));
    await userEvent.click(screen.getByRole("radio", { name: "30" }));
    await waitFor(async () =>
      expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, desiredRetention: 0.95, timeSignal: false, idleSeconds: 120, newPerDay: 30 }),
    );
    expect(screen.getByRole("radio", { name: "95%" })).toHaveAttribute("aria-checked", "true");
  });
});

async function makeDeck(name: string, text = "1. e4 e5 2. Nf3") {
  const made = await createDeck(name);
  if (!made.ok) throw new Error(made.error);
  const parsed = parseMovetext(text, START_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  const built = buildDeckCards(parsed.tree, { side: "w", shape: "moves", context: "rest" });
  if (!built.ok) throw new Error(built.error);
  await addCards(made.deck.id, built.drafts);
  return made.deck.id;
}

const chooseFile = async (contents: string, name = "backup.json") => {
  const file = new File([contents], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => contents });
  await userEvent.upload(screen.getByLabelText("Backup file"), file);
};

describe("Settings: your data", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("downloads a backup of everything", async () => {
    await makeDeck("Open");
    const saved: { name: string; text: string }[] = [];
    const download = await import("../../data/download");
    const spy = vi.spyOn(download, "downloadText").mockImplementation((name, text) => void saved.push({ name, text }));
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Download backup" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toMatch(/^rockchess-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(saved[0].text)).toMatchObject({ app: "rockchess", scope: "all" });
    spy.mockRestore();
  });

  it("refuses a file that isn't a backup, and changes nothing", async () => {
    await makeDeck("Open");
    renderSettings();
    await screen.findByRole("button", { name: "Choose a file" });
    await chooseFile("hello");
    expect(await screen.findByText(/isn't a RockChess backup/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to what I have" })).not.toBeInTheDocument();
    expect(await db.decks.count()).toBe(1);
  });

  it("checks a file first, shows what is in it, then adds it", async () => {
    const id = await makeDeck("Open");
    const backup = await exportBackup(id);
    await db.delete();
    await db.open();
    renderSettings();
    await screen.findByRole("button", { name: "Choose a file" });
    await chooseFile(JSON.stringify(backup), "open.json");
    expect(await screen.findByText("open.json")).toBeInTheDocument();
    expect(screen.getByText(/1 deck, 2 cards, 0 reviews/)).toBeInTheDocument();
    expect(await db.decks.count()).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Add to what I have" }));
    expect(await screen.findByText(/Added 1 deck and 2 cards/)).toBeInTheDocument();
    expect(await db.cards.count()).toBe(2);
  });

  it("says what can't be read before anything is added", async () => {
    const id = await makeDeck("Open");
    const backup = await exportBackup(id);
    backup.data.cards.push({ ...backup.data.cards[0], id: "broken", fen: "nonsense" });
    renderSettings();
    await screen.findByRole("button", { name: "Choose a file" });
    await chooseFile(JSON.stringify(backup));
    expect(await screen.findByText(/can't be read and will be left out: 1 card/)).toBeInTheDocument();
  });

  it("can't replace everything from a single deck", async () => {
    const id = await makeDeck("Open");
    const backup = await exportBackup(id);
    renderSettings();
    await screen.findByRole("button", { name: "Choose a file" });
    await chooseFile(JSON.stringify(backup));
    await screen.findByRole("button", { name: "Add to what I have" });
    expect(screen.queryByRole("button", { name: "Replace everything" })).not.toBeInTheDocument();
  });

  it("warns, and waits for a second press, before replacing everything", async () => {
    const id = await makeDeck("Open");
    const backup = await exportBackup();
    await makeDeck("Stray", "1. d4 d5 2. c4");
    renderSettings();
    await screen.findByRole("button", { name: "Choose a file" });
    await chooseFile(JSON.stringify(backup));
    await userEvent.click(await screen.findByRole("button", { name: "Replace everything" }));
    expect(screen.getByText(/can't be undone/)).toBeInTheDocument();
    expect(await db.decks.count()).toBe(2);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/can't be undone/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace everything" }));
    await userEvent.click(screen.getByRole("button", { name: "Replace everything" }));
    expect(await screen.findByText(/Restored 1 deck and 2 cards/)).toBeInTheDocument();
    expect((await db.decks.toArray()).map((deck) => deck.id)).toEqual([id]);
  });

  it("says when the browser can't promise to keep the data", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    renderSettings();
    expect(await screen.findByText(/doesn't say whether it will keep your data/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep my data" })).not.toBeInTheDocument();
  });

  it("offers to keep the data when the browser hasn't agreed, and reports the answer", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: { persisted: async () => false, persist: async () => true, estimate: async () => ({ usage: 3 * 1024 * 1024 }) } });
    renderSettings();
    expect(await screen.findByText(/could be cleared/)).toBeInTheDocument();
    expect(screen.getByText(/using 3.0 MB/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep my data" }));
    expect(await screen.findByText(/agreed to keep your data/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep my data" })).not.toBeInTheDocument();
  });
});
