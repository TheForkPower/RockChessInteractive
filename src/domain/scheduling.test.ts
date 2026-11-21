import { describe, expect, it } from "vitest";
import {
  applyGrade,
  dueLabel,
  formatInterval,
  GRADES,
  median,
  previewGrades,
  recallChance,
  suggestGrade,
  type Schedule,
} from "./scheduling";
import type { Timing } from "./timing";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 10, 12, 0, 0).getTime();

const timing = (overrides: Partial<Timing> = {}): Timing => ({
  shownAt: 0,
  firstMoveAt: 3000,
  completedAt: 4000,
  elapsedMs: 4000,
  activeMs: 4000,
  idleMs: 0,
  hiddenMs: 0,
  firstMoveActiveMs: 3000,
  flags: [],
  reliable: true,
  ...overrides,
});

describe("scheduling a new card", () => {
  it("previews four grades that land further out as the grade rises", () => {
    const preview = previewGrades(null, NOW, 0.9);
    const days = GRADES.map((grade) => preview[grade].days);
    expect(days[0]).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < days.length; i += 1) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
    expect(days[3]).toBeGreaterThan(days[0]);
  });

  it("gives the same answer twice, so the previews can be trusted", () => {
    expect(previewGrades(null, NOW, 0.9)).toEqual(previewGrades(null, NOW, 0.9));
  });

  it("a preview matches what grading really does", () => {
    const preview = previewGrades(null, NOW, 0.9);
    for (const grade of GRADES) {
      expect(applyGrade(null, grade, NOW, 0.9).memory).toEqual(preview[grade].memory);
    }
  });

  it("records the first review", () => {
    const applied = applyGrade(null, "good", NOW, 0.9);
    expect(applied.memory.reps).toBe(1);
    expect(applied.memory.lastReview).toBe(NOW);
    expect(applied.memory.due).toBeGreaterThan(NOW);
    expect(applied.before).toEqual({ state: 0, due: null, stability: null, difficulty: null });
    expect(applied.elapsedDays).toBe(0);
  });
});

describe("scheduling a card that has history", () => {
  const first = applyGrade(null, "good", NOW, 0.9).memory;
  const stored: Schedule = { cardId: "a", deckId: "d", ...first };

  it("reviewing on the due date makes the gap longer", () => {
    const later = applyGrade(stored, "good", stored.due, 0.9);
    expect(later.memory.scheduledDays).toBeGreaterThan(stored.scheduledDays);
    expect(later.memory.reps).toBe(2);
    expect(later.before.due).toBe(stored.due);
    expect(later.before.stability).toBe(stored.stability);
  });

  it("forgetting counts a lapse and shortens the gap", () => {
    const grown = applyGrade(stored, "good", stored.due, 0.9).memory;
    const lapsed = applyGrade(grown, "again", grown.due, 0.9);
    expect(lapsed.memory.lapses).toBe(1);
    expect(lapsed.memory.scheduledDays).toBeLessThan(grown.scheduledDays);
  });

  it("wanting to remember more means shorter gaps", () => {
    const gentle = applyGrade(stored, "good", stored.due, 0.8).memory.scheduledDays;
    const strict = applyGrade(stored, "good", stored.due, 0.95).memory.scheduledDays;
    expect(strict).toBeLessThan(gentle);
  });

  it("reports how long it had been", () => {
    expect(applyGrade(stored, "good", stored.due + 2 * DAY, 0.9).elapsedDays).toBeGreaterThan(stored.scheduledDays);
  });

  it("recall chance falls as time passes", () => {
    const soon = recallChance(stored, NOW + DAY, 0.9);
    const late = recallChance(stored, NOW + 60 * DAY, 0.9);
    expect(soon).toBeGreaterThan(late);
    expect(soon).toBeLessThanOrEqual(1);
    expect(late).toBeGreaterThanOrEqual(0);
  });
});

describe("wording", () => {
  it("formats gaps", () => {
    expect(formatInterval(0.5)).toBe("12 hours");
    expect(formatInterval(1)).toBe("1 day");
    expect(formatInterval(6.2)).toBe("6 days");
    expect(formatInterval(45)).toBe("1 month");
    expect(formatInterval(100)).toBe("3 months");
    expect(formatInterval(730)).toBe("2 years");
  });

  it("says when a card is due, by calendar day", () => {
    expect(dueLabel(NOW - 3 * DAY, NOW)).toBe("Overdue by 3 days");
    expect(dueLabel(NOW - 1000, NOW)).toBe("Due now");
    expect(dueLabel(NOW + 3600_000, NOW)).toBe("Due today");
    expect(dueLabel(NOW + DAY, NOW)).toBe("Due tomorrow");
    expect(dueLabel(NOW + 5 * DAY, NOW)).toBe("Due in 5 days");
  });

  it("finds a median", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});

describe("the suggested grade", () => {
  const history = Array.from({ length: 10 }, () => 8000);
  const base = { playerMoves: 1, history, useTime: true };

  it("follows the outcome", () => {
    expect(suggestGrade({ ...base, outcome: "first-try", timing: timing({ activeMs: 8000 }) }).grade).toBe("good");
    expect(suggestGrade({ ...base, outcome: "with-help", timing: timing() }).grade).toBe("hard");
    expect(suggestGrade({ ...base, outcome: "partial", timing: timing() }).grade).toBe("again");
    expect(suggestGrade({ ...base, outcome: "shown", timing: timing() }).grade).toBe("again");
  });

  it("a clearly quick right answer is suggested as Easy, and says so", () => {
    const result = suggestGrade({ ...base, outcome: "first-try", timing: timing({ activeMs: 3000 }) });
    expect(result.grade).toBe("easy");
    expect(result.nudged).toBe(true);
  });

  it("never goes down for a slow answer", () => {
    const result = suggestGrade({ ...base, outcome: "first-try", timing: timing({ activeMs: 120_000 }) });
    expect(result.grade).toBe("good");
    expect(result.nudged).toBe(false);
  });

  it("ignores time until there is enough history", () => {
    const result = suggestGrade({ ...base, history: [8000, 8000], outcome: "first-try", timing: timing({ activeMs: 1000 }) });
    expect(result.grade).toBe("good");
  });

  it("ignores a time that may be off", () => {
    const result = suggestGrade({
      ...base,
      outcome: "first-try",
      timing: timing({ activeMs: 1000, reliable: false, flags: ["hidden"] }),
    });
    expect(result.grade).toBe("good");
    expect(result.reason).toMatch(/away or idle/);
  });

  it("compares per move, so a long line isn't fast just because it is long", () => {
    const line = suggestGrade({ ...base, playerMoves: 4, outcome: "first-try", timing: timing({ activeMs: 20_000 }) });
    expect(line.grade).toBe("good");
    const quickLine = suggestGrade({ ...base, playerMoves: 4, outcome: "first-try", timing: timing({ activeMs: 12_000 }) });
    expect(quickLine.grade).toBe("easy");
  });

  it("does nothing with time when the setting is off", () => {
    const result = suggestGrade({ ...base, useTime: false, outcome: "first-try", timing: timing({ activeMs: 500 }) });
    expect(result.grade).toBe("good");
  });
});
