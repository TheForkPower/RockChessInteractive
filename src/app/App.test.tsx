import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App shell", () => {
  it("shows the home page with an honestly unavailable start button", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Chess positions you won't forget.");
    const start = screen.getByRole("button", { name: /start learning & review/i });
    expect(start).toHaveAttribute("aria-disabled", "true");
    expect(start).toHaveAccessibleDescription(/not built yet/i);
  });

  it("offers every main destination in one navigation landmark", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const name of ["Home", "Decks", "Create", "Settings"]) {
      expect(nav).toContainElement(screen.getByRole("link", { name }));
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
