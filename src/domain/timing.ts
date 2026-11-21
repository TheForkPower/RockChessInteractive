/**
 * Response time for one card, measured so that time away from the card doesn't
 * count as thinking time.
 *
 * The timer is told when the card appears, when the person does something
 * (moves the mouse, presses a key, touches the screen), when the tab is hidden
 * or shown again, when the first move is made and when the card is finished.
 * It never reads the clock itself, so it can be tested with made-up times.
 *
 * Between two signs of life, a gap up to the idle limit counts as thinking. A
 * longer gap counts as thinking only up to the limit, and the rest is idle. Time
 * with the tab hidden is kept apart from both. A card that has a lot of idle or
 * hidden time, or an unusually long total, is flagged as unreliable. It is
 * flagged, not penalised: the schedule just doesn't learn from its time.
 */

export const DEFAULT_IDLE_MS = 30_000;

/** Hidden for this long and the time is no longer trusted. */
export const HIDDEN_LIMIT_MS = 5_000;
/** This much idle time and the time is no longer trusted. */
export const IDLE_LIMIT_MS = 60_000;
/** Thinking for this long on one card is unusual enough to leave out of the averages. */
export const LONG_LIMIT_MS = 10 * 60_000;

export type TimingFlag = "hidden" | "idle" | "long";

export type Timing = {
  shownAt: number;
  firstMoveAt: number | null;
  completedAt: number | null;
  /** Wall-clock time from the card appearing to now (or to completion). */
  elapsedMs: number;
  /** Time spent looking at the card and doing things on it. */
  activeMs: number;
  /** Time beyond the idle limit with nothing happening. */
  idleMs: number;
  /** Time with the tab hidden or the window in the background. */
  hiddenMs: number;
  /** Active time up to the first move. */
  firstMoveActiveMs: number | null;
  flags: TimingFlag[];
  /** True when nothing suggests the time is off. */
  reliable: boolean;
};

export class ResponseTimer {
  private readonly shownAt: number;
  private readonly idleLimit: number;
  private lastSeen: number;
  private active = 0;
  private idle = 0;
  private hidden = 0;
  private hiddenSince: number | null = null;
  private firstMoveAt: number | null = null;
  private firstMoveActive: number | null = null;
  private completedAt: number | null = null;

  constructor(now: number, idleLimitMs = DEFAULT_IDLE_MS) {
    this.shownAt = now;
    this.lastSeen = now;
    this.idleLimit = idleLimitMs;
  }

  /** Counts the time since the last sign of life, up to the idle limit. */
  private advance(to: number) {
    if (this.completedAt !== null || this.hiddenSince !== null) return;
    const gap = Math.max(0, to - this.lastSeen);
    this.active += Math.min(gap, this.idleLimit);
    this.idle += Math.max(0, gap - this.idleLimit);
    this.lastSeen = Math.max(this.lastSeen, to);
  }

  /** The person did something on the page. */
  activity(at: number) {
    this.advance(at);
  }

  /** The tab or window went into the background. */
  hide(at: number) {
    if (this.completedAt !== null || this.hiddenSince !== null) return;
    this.advance(at);
    this.hiddenSince = at;
  }

  /** The tab or window came back. */
  show(at: number) {
    if (this.hiddenSince === null) return;
    this.hidden += Math.max(0, at - this.hiddenSince);
    this.hiddenSince = null;
    this.lastSeen = at;
  }

  /** The first move was played. Only the first call counts. */
  firstMove(at: number) {
    if (this.firstMoveAt !== null || this.completedAt !== null) return;
    this.advance(at);
    this.firstMoveAt = at;
    this.firstMoveActive = this.active;
  }

  /** The card is finished. The numbers stop changing. */
  complete(at: number): Timing {
    if (this.completedAt === null) {
      this.show(at);
      this.advance(at);
      this.completedAt = at;
    }
    return this.snapshot();
  }

  snapshot(): Timing {
    const flags: TimingFlag[] = [];
    if (this.hidden >= HIDDEN_LIMIT_MS) flags.push("hidden");
    if (this.idle >= IDLE_LIMIT_MS) flags.push("idle");
    if (this.active >= LONG_LIMIT_MS) flags.push("long");
    const end = this.completedAt ?? this.lastSeen;
    return {
      shownAt: this.shownAt,
      firstMoveAt: this.firstMoveAt,
      completedAt: this.completedAt,
      elapsedMs: Math.max(0, end - this.shownAt),
      activeMs: this.active,
      idleMs: this.idle,
      hiddenMs: this.hidden,
      firstMoveActiveMs: this.firstMoveActive,
      flags,
      reliable: flags.length === 0,
    };
  }
}

/** "12 s", "1 min 5 s". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
