import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../data/db";
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
  it("thanks Martin Sedlák for the pieces and links to them", () => {
    renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "Credits" })).toBeInTheDocument();
    expect(screen.getByText(/Thank you to Martin Sedlák/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meridian on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/kmar/chess_svg_piece_sets/tree/main/meridian",
    );
  });

  it("shows the defaults to begin with", async () => {
    renderSettings();
    expect(await screen.findByRole("radio", { name: "90%" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "30 s" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("radio", { name: "On" })[0]).toHaveAttribute("aria-checked", "true");
  });

  it("saves a change and keeps it", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("radio", { name: "95%" }));
    await waitFor(async () => expect((await getSettings()).desiredRetention).toBe(0.95));
    await userEvent.click(screen.getByRole("radio", { name: "Off" }));
    await userEvent.click(screen.getByRole("radio", { name: "2 min" }));
    await waitFor(async () => expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, desiredRetention: 0.95, timeSignal: false, idleSeconds: 120 }));
    expect(screen.getByRole("radio", { name: "95%" })).toHaveAttribute("aria-checked", "true");
  });
});
