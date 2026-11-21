/** Manual: you press Again, Hard, Good or Easy. Smart: the app picks one from how the card went, and you can change it. */
export type GradingMode = "manual" | "smart";

export const GRADING_MODES: GradingMode[] = ["manual", "smart"];

export type Settings = {
  /** Who picks the grade after a review. */
  grading: GradingMode;
  /** The share of cards you want to still remember when they come back. FSRS sets the gaps from this. */
  desiredRetention: number;
  /** Let response time count: a quick right answer can be Easy, and with smart grading a much slower one can be Hard. */
  timeSignal: boolean;
  /** How long a pause still counts as thinking, in seconds. */
  idleSeconds: number;
  /** How many cards you have never seen are introduced each day. */
  newPerDay: number;
};

export const DEFAULT_SETTINGS: Settings = { grading: "manual", desiredRetention: 0.9, timeSignal: true, idleSeconds: 30, newPerDay: 10 };

export const RETENTION_CHOICES = [0.8, 0.85, 0.9, 0.95] as const;
export const IDLE_CHOICES = [15, 30, 60, 120] as const;
export const NEW_PER_DAY_CHOICES = [5, 10, 20, 30, 50] as const;

const nearest = <T extends number>(choices: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "number" && Number.isFinite(value)
    ? choices.reduce((best, choice) => (Math.abs(choice - value) < Math.abs(best - value) ? choice : best))
    : fallback;

/** Turns whatever was saved into valid settings, filling gaps with the defaults. */
export function normaliseSettings(raw: unknown): Settings {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    grading: value.grading === "smart" ? "smart" : "manual",
    desiredRetention: nearest(RETENTION_CHOICES, value.desiredRetention, DEFAULT_SETTINGS.desiredRetention),
    timeSignal: typeof value.timeSignal === "boolean" ? value.timeSignal : DEFAULT_SETTINGS.timeSignal,
    idleSeconds: nearest(IDLE_CHOICES, value.idleSeconds, DEFAULT_SETTINGS.idleSeconds),
    newPerDay: nearest(NEW_PER_DAY_CHOICES, value.newPerDay, DEFAULT_SETTINGS.newPerDay),
  };
}
