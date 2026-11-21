import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard, type FSRS, type Grade as FsrsGrade } from "ts-fsrs";
import type { Outcome } from "./review";
import type { Timing } from "./timing";

export type Grade = "again" | "hard" | "good" | "easy";
export const GRADES: Grade[] = ["again", "hard", "good", "easy"];
export const GRADE_LABELS: Record<Grade, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

/** The number FSRS uses for a grade. */
export const RATING: Record<Grade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };

const FSRS_GRADE: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function gradeOfRating(rating: number): Grade {
  return GRADES[Math.min(4, Math.max(1, Math.round(rating))) - 1];
}

/** 0 new, 1 learning, 2 review, 3 relearning. */
export type ScheduleState = 0 | 1 | 2 | 3;

/** What is saved about one card once it has been graded. Cards with none are new. */
export type Schedule = {
  cardId: string;
  deckId: string;
  /** When the card is next due, in milliseconds. */
  due: number;
  stability: number;
  difficulty: number;
  /** The gap FSRS chose at the last review, in days. */
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: ScheduleState;
  lastReview: number | null;
};

type Memory = Omit<Schedule, "cardId" | "deckId">;

/**
 * One scheduler per desired retention. Chess cards are scheduled in whole days:
 * no minute-long learning steps, and no fuzz, so the same grade always gives the
 * same gap and the button previews are exact.
 */
export function makeScheduler(desiredRetention: number): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: desiredRetention,
      enable_fuzz: false,
      enable_short_term: false,
    }),
  );
}

function toFsrs(memory: Memory | null, now: Date): FsrsCard {
  if (!memory) return createEmptyCard(now);
  return {
    due: new Date(memory.due),
    stability: memory.stability,
    difficulty: memory.difficulty,
    elapsed_days: 0,
    scheduled_days: memory.scheduledDays,
    learning_steps: memory.learningSteps,
    reps: memory.reps,
    lapses: memory.lapses,
    state: memory.state,
    last_review: memory.lastReview === null ? undefined : new Date(memory.lastReview),
  };
}

function fromFsrs(card: FsrsCard): Memory {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as ScheduleState,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}

export type Preview = Record<Grade, { memory: Memory; days: number }>;

/** What each of the four grades would do to the card, without saving anything. */
export function previewGrades(memory: Memory | null, now: number, desiredRetention: number): Preview {
  const scheduler = makeScheduler(desiredRetention);
  const log = scheduler.repeat(toFsrs(memory, new Date(now)), new Date(now));
  const out = {} as Preview;
  for (const grade of GRADES) {
    const next = fromFsrs(log[FSRS_GRADE[grade]].card);
    out[grade] = { memory: next, days: (next.due - now) / 86_400_000 };
  }
  return out;
}

export type Applied = {
  memory: Memory;
  before: { state: ScheduleState; due: number | null; stability: number | null; difficulty: number | null };
  elapsedDays: number;
};

/** Grades a card: the new schedule, and what it was before. */
export function applyGrade(memory: Memory | null, grade: Grade, now: number, desiredRetention: number): Applied {
  const scheduler = makeScheduler(desiredRetention);
  const result = scheduler.next(toFsrs(memory, new Date(now)), new Date(now), FSRS_GRADE[grade]);
  return {
    memory: fromFsrs(result.card),
    before: {
      state: memory?.state ?? 0,
      due: memory?.due ?? null,
      stability: memory ? memory.stability : null,
      difficulty: memory ? memory.difficulty : null,
    },
    elapsedDays: memory?.lastReview ? Math.max(0, (now - memory.lastReview) / 86_400_000) : 0,
  };
}

/** The chance of remembering the card right now, from 0 to 1. */
export function recallChance(memory: Memory, now: number, desiredRetention: number): number {
  return makeScheduler(desiredRetention).get_retrievability(toFsrs(memory, new Date(now)), new Date(now), false);
}

/** "3 days", "2 months": how far off a due date is. */
export function formatInterval(days: number): string {
  if (days < 1 / 24) return "now";
  if (days < 1) {
    const hours = Math.round(days * 24);
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const whole = Math.round(days);
  if (whole < 30) return whole === 1 ? "1 day" : `${whole} days`;
  if (whole < 365) {
    const months = Math.round(whole / 30.4);
    return months === 1 ? "1 month" : `${months} months`;
  }
  const years = Math.round((whole / 365) * 10) / 10;
  return years === 1 ? "1 year" : `${years} years`;
}

const MIDNIGHT_DAY = 86_400_000;

/** "Due today", "Due tomorrow", "Due in 5 days", "Overdue by 2 days". Whole calendar days, in local time. */
export function dueLabel(due: number, now: number): string {
  const start = (time: number) => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.round((start(due) - start(now)) / MIDNIGHT_DAY);
  if (days < 0) return days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`;
  if (days === 0) return due <= now ? "Due now" : "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${formatInterval(days)}`;
}

// ------------------------------------------------------------- suggestion

/** Fewest earlier timings needed before speed counts for anything. */
export const MIN_TIMINGS = 8;
/** "Fast" means this share of your usual time per move, or less. */
export const FAST_SHARE = 0.5;

/** "Much slower" means this many times your usual time per move, or more. Only smart grading uses it. */
export const SLOW_SHARE = 2.5;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type Suggestion = {
  grade: Grade;
  /** One line saying why, for the person to read. */
  reason: string;
  /** True when response time moved the suggestion up from what the outcome alone gave. */
  nudged: boolean;
};

const BASE: Record<Outcome, { grade: Grade; reason: string }> = {
  "first-try": { grade: "good", reason: "Right first time." },
  "with-help": { grade: "hard", reason: "It took a hint or a second try." },
  partial: { grade: "again", reason: "Only part of the line was right." },
  shown: { grade: "again", reason: "You needed to see the answer." },
};

export type SuggestInput = {
  outcome: Outcome;
  timing: Timing;
  /** How many moves you had to play on this card. */
  playerMoves: number;
  /** Your earlier times per move on cards you got right first time, in milliseconds. Only reliable ones. */
  history: number[];
  useTime: boolean;
};

/**
 * What the app thinks the grade should be, shown on the buttons. The outcome
 * (right first time, needed help, and so on) sets it. Response time can lift
 * Good to Easy when you were clearly quicker than you usually are, and that is
 * all it does: a slow answer never lowers the suggestion, and a time that may be
 * off (you left the page, or sat idle) counts for nothing. The person picks the
 * grade, and what they pick is what FSRS gets.
 */
export function suggestGrade({ outcome, timing, playerMoves, history, useTime }: SuggestInput): Suggestion {
  const base = BASE[outcome];
  if (outcome !== "first-try") return { ...base, nudged: false };
  if (!useTime) return { ...base, nudged: false };
  if (!timing.reliable) return { ...base, reason: "Right first time. The time wasn't counted: you were away or idle.", nudged: false };

  const usual = history.length >= MIN_TIMINGS ? median(history) : null;
  if (usual === null || usual <= 0) return { ...base, nudged: false };

  const perMove = timing.activeMs / Math.max(1, playerMoves);
  if (perMove <= usual * FAST_SHARE) {
    return { grade: "easy", reason: "Right first time, and quicker than usual.", nudged: true };
  }
  return { ...base, nudged: false };
}

export type SmartInput = SuggestInput & {
  /** Wrong moves tried on this card. */
  mistakes: number;
};

/**
 * The grade smart grading picks. It starts from what the suggestion would be, then adds two things:
 * two or more wrong tries is Again, and a right-first-time answer that took much longer than usual is Hard.
 * As with the suggestion, a time that may be off (you left the page, or sat idle) counts for nothing,
 * and with too little history there is nothing to compare against.
 */
export function smartGrade(input: SmartInput): Suggestion {
  const { outcome, timing, playerMoves, history, useTime, mistakes } = input;
  if (outcome === "with-help" && mistakes >= 2) {
    return { grade: "again", reason: "It took two or more wrong tries.", nudged: false };
  }
  if (outcome === "first-try" && useTime && timing.reliable && history.length >= MIN_TIMINGS) {
    const usual = median(history);
    const perMove = timing.activeMs / Math.max(1, playerMoves);
    if (usual !== null && usual > 0 && perMove >= usual * SLOW_SHARE) {
      return { grade: "hard", reason: "Right first time, but much slower than usual.", nudged: true };
    }
  }
  return suggestGrade(input);
}
