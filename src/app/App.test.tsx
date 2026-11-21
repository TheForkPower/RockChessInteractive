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
  it("keeps the home page simple: a heading and one box that goes to Recall", () => {
    renderAt("/");
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Recall" })).toHaveAttribute("href", "/recall");
    expect(main.queryByText(/Anki for chess positions/)).not.toBeInTheDocument();
    expect(main.queryByRole("link", { name: /start learning/i })).not.toBeInTheDocument();
    // Only the one box, plus the quiet link to the design system.
    expect(main.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("puts the old landing page at /recall, with its start button going to the decks", () => {
    renderAt("/recall");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Anki for chess positions.");
    expect(screen.getByRole("link", { name: /start learning & review/i })).toHaveAttribute("href", "/decks");
  });

  it("reaches Recall from the home box", async () => {
    renderAt("/");
    await userEvent.click(within(screen.getByRole("main")).getByRole("link", { name: "Recall" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Anki for chess positions.");
    expect(screen.getByRole("navigation", { name: "Main" })).toContainElement(screen.getByRole("link", { name: "Recall" }));
  });

  it("offers every main destination in one navigation landmark", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const name of ["Home", "Recall", "Decks", "Create", "Settings"]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("marks the current page and navigates between pages", async () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("link", { name: "Decks" }));
    expect(screen.getByRole("heading", { level: 1, name: "Decks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the design system page and a not-found page", () => {
    const { unmount } = renderAt("/design");
    expect(screen.getByRole("heading", { level: 1, name: "Design system" })).toBeInTheDocument();
    const grades = within(screen.getByRole("group", { name: "Grade buttons" }));
    for (const name of ["Again", "Hard", "Good", "Easy"]) {
      expect(grades.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    unmount();
    renderAt("/nope");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("That page doesn't exist");
  });
});
