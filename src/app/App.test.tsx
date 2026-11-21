import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../board/Board", async () => await import("../test/boardMock"));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App shell", () => {
  it("keeps the home page simple: a heading and one box that goes to the decks", () => {
    renderAt("/");
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/decks");
    expect(main.queryByRole("link", { name: "Recall" })).not.toBeInTheDocument();
    expect(main.queryByText(/Anki for chess positions/)).not.toBeInTheDocument();
    expect(main.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("puts the landing page at /recall, with no full stop and the points as a list", () => {
    renderAt("/recall");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Anki for chess positions$/);
    const points = within(screen.getAllByRole("list")[1]).getAllByRole("listitem").map((item) => item.textContent);
    expect(points).toEqual([
      "Make cards from positions in your PGNs",
      "Play the answer on the board",
      "Each card comes back when it's due",
    ]);
    expect(screen.getByRole("link", { name: /start learning & review/i })).toHaveAttribute("href", "/review?all=1");
  });

  it("explains what Recall does, with a screenshot and links to make cards and open decks", () => {
    renderAt("/recall");
    const section = within(screen.getByRole("region", { name: "What you can do here" }));
    expect(section.getByRole("img", { name: /The Learn screen/ })).toHaveAttribute("width", "1600");
    for (const title of ["Make cards from your own material", "Learn a new card by playing it", "Review it when it's due", "Drill the hard ones", "Keep your data"]) {
      expect(section.getByText(title)).toBeInTheDocument();
    }
    expect(section.getByRole("link", { name: "Make cards" })).toHaveAttribute("href", "/create");
    expect(section.getByRole("link", { name: "Open your decks" })).toHaveAttribute("href", "/decks");
  });

  it("has a Tools menu in the header with Recall as its only option", async () => {
    renderAt("/");
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.queryByRole("link", { name: "Recall" })).not.toBeInTheDocument();
    await userEvent.click(nav.getByRole("button", { name: "Tools" }));
    const items = within(screen.getByRole("menu", { name: "Tools" })).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Recall"]);
    await userEvent.click(items[0]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Anki for chess positions");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers every main destination in one navigation landmark", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const name of ["Home", "Decks", "Create", "Settings"]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("button", { name: "Tools" })).toBeInTheDocument();
  });

  it("marks the current page and navigates between pages", async () => {
    renderAt("/");
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(nav.getByRole("link", { name: "Decks" }));
    expect(screen.getByRole("heading", { level: 1, name: "Decks" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Decks" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the design system page and a not-found page", async () => {
    const { unmount } = renderAt("/design");
    expect(await screen.findByRole("heading", { level: 1, name: "Design system" })).toBeInTheDocument();
    const grades = within(screen.getByRole("group", { name: "Grade buttons" }));
    for (const name of ["Again", "Hard", "Good", "Easy"]) {
      expect(grades.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    unmount();
    renderAt("/nope");
    expect(screen.getByRole("heading", { level: 1, name: "Illegal move!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the start" })).toHaveAttribute("href", "/");
  });

  it("names each page in the browser tab", async () => {
    const { unmount } = renderAt("/decks");
    expect(document.title).toBe("Decks | RockChess");
    unmount();
    renderAt("/settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" });
    expect(document.title).toBe("Settings | RockChess");
  });

  it("goes back to the top when the page changes", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderAt("/");
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Decks" }));
    expect(scroll).toHaveBeenLastCalledWith(0, 0);
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(2);
    scroll.mockRestore();
  });
});
