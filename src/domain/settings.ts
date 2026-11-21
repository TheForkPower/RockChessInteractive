export type Settings = {
  /** The share of cards you want to still remember when they come back. FSRS sets the gaps from this. */
  desiredRetention: number;
  /** Let a quick correct answer move the suggested grade from Good to Easy. Never moves it down. */
  timeSignal: boolean;
  /** How long a pause still counts as thinking, in seconds. */
  idleSeconds: number;
};

export const DEFAULT_SETTINGS: Settings = { desiredRetention: 0.9, timeSignal: true, idleSeconds: 30 };

export const RETENTION_CHOICES = [0.8, 0.85, 0.9, 0.95] as const;
export const IDLE_CHOICES = [15, 30, 60, 120] as const;

const nearest = <T extends number>(choices: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "number" && Number.isFinite(value)
    ? choices.reduce((best, choice) => (Math.abs(choice - value) < Math.abs(best - value) ? choice : best))
    : fallback;

/** Turns whatever was saved into valid settings, filling gaps with the defaults. */
export function normaliseSettings(raw: unknown): Settings {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    desiredRetention: nearest(RETENTION_CHOICES, value.desiredRetention, DEFAULT_SETTINGS.desiredRetention),
    timeSignal: typeof value.timeSignal === "boolean" ? value.timeSignal : DEFAULT_SETTINGS.timeSignal,
    idleSeconds: nearest(IDLE_CHOICES, value.idleSeconds, DEFAULT_SETTINGS.idleSeconds),
  };
}
