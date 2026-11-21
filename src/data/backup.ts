import { CATEGORIES, checkContinuation, type Card, type CardMove } from "../domain/cards";
import { OUTCOME_LABELS, planCard } from "../domain/review";
import type { Schedule } from "../domain/scheduling";
import { normaliseSettings } from "../domain/settings";
import { db, type Deck, type MetaEntry, type ReviewEntry, type Source } from "./db";
import { sameCard } from "./repo";

/**
 * Backups are one JSON file. The format is written down in docs/BACKUP_FORMAT.md.
 * `format` counts up when the layout changes, and old numbers stay readable through `migrate`.
 */
export const BACKUP_APP = "rockchess";
export const BACKUP_FORMAT = 1;

export type BackupData = {
  decks: Deck[];
  cards: Card[];
  sources: Source[];
  schedules: Schedule[];
  reviews: ReviewEntry[];
  meta: MetaEntry[];
};

export type Backup = {
  app: typeof BACKUP_APP;
  format: number;
  /** When the backup was made, as an ISO date. */
  exportedAt: string;
  /** "all" is everything in the browser. "deck" is one deck with its cards and progress. */
  scope: "all" | "deck";
  data: BackupData;
};

// ----------------------------------------------------------------- export

export async function exportBackup(deckId?: string, now = new Date()): Promise<Backup> {
  if (deckId === undefined) {
    const [decks, cards, sources, schedules, reviews, meta] = await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.sources.toArray(),
      db.schedules.toArray(),
      db.reviews.toArray(),
      db.meta.toArray(),
    ]);
    return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: now.toISOString(), scope: "all", data: { decks, cards, sources, schedules, reviews, meta } };
  }
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error("That deck no longer exists.");
  const cards = await db.cards.where("deckId").equals(deckId).toArray();
  const ids = cards.map((card) => card.id);
  const sourceIds = [...new Set(cards.map((card) => card.sourceId).filter((id): id is string => Boolean(id)))];
  const [schedules, reviews, sources] = await Promise.all([
    db.schedules.where("cardId").anyOf(ids).toArray(),
    db.reviews.where("cardId").anyOf(ids).toArray(),
    db.sources.bulkGet(sourceIds),
  ]);
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    scope: "deck",
    data: { decks: [deck], cards, sources: sources.filter((item): item is Source => Boolean(item)), schedules, reviews, meta: [] },
  };
}

export function backupFileName(backup: Pick<Backup, "scope" | "data" | "exportedAt">): string {
  const day = backup.exportedAt.slice(0, 10);
  if (backup.scope === "all") return `rockchess-backup-${day}.json`;
  const slug = (backup.data.decks[0]?.name ?? "deck").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "deck";
  return `rockchess-deck-${slug}-${day}.json`;
}

// ------------------------------------------------------------------ read

export type Problems = {
  decks: number;
  cards: number;
  schedules: number;
  reviews: number;
  sources: number;
  /** Cards that were kept but had their saved line cleared, because it couldn't be read. */
  adjusted: number;
};

export type ReadResult =
  | { ok: true; backup: Backup; problems: Problems }
  | { ok: false; error: string };

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const isStr = (value: unknown): value is string => typeof value === "string";
const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, fallback = "") => (isStr(value) ? value : fallback);
const when = (value: unknown, fallback: number) => (isNum(value) ? value : fallback);

const CATEGORY_VALUES = new Set(CATEGORIES.map((item) => item.value));
const OUTCOMES = new Set(Object.keys(OUTCOME_LABELS));

function cleanMove(value: unknown): CardMove | null {
  if (!isObj(value) || !isStr(value.from) || !isStr(value.to) || !isStr(value.san)) return null;
  const promotion = value.promotion;
  if (promotion !== undefined && promotion !== "q" && promotion !== "r" && promotion !== "b" && promotion !== "n") return null;
  return { from: value.from, to: value.to, san: value.san, ...(promotion ? { promotion } : {}) };
}

function cleanMoves(value: unknown): CardMove[] | null {
  if (!Array.isArray(value)) return null;
  const moves = value.map(cleanMove);
  return moves.every((move): move is CardMove => move !== null) ? moves : null;
}

function cleanDeck(value: unknown, now: number): Deck | null {
  if (!isObj(value) || !isStr(value.id) || value.id === "" || !isStr(value.name) || value.name.trim() === "") return null;
  const theme = value.theme === "tutorial" || value.theme === "difficult" ? value.theme : undefined;
  return {
    id: value.id,
    name: value.name.trim(),
    ...(isStr(value.description) ? { description: value.description } : {}),
    ...(isStr(value.color) ? { color: value.color } : {}),
    ...(theme ? { theme } : {}),
    createdAt: when(value.createdAt, now),
    updatedAt: when(value.updatedAt, now),
  };
}

function cleanCard(value: unknown, now: number, counters: Problems): Card | null {
  if (!isObj(value) || !isStr(value.id) || value.id === "" || !isStr(value.deckId) || !isStr(value.fen)) return null;
  if (value.kind !== "move" && value.kind !== "line") return null;
  if (value.side !== "w" && value.side !== "b") return null;
  if (!isStr(value.category) || !CATEGORY_VALUES.has(value.category as never)) return null;
  const answer = cleanMoves(value.answer);
  if (!answer || answer.length === 0) return null;
  const alternatives = value.alternatives === undefined ? [] : cleanMoves(value.alternatives);
  if (!alternatives) return null;
  const tags = Array.isArray(value.tags) ? value.tags.filter(isStr) : [];

  const card: Card = {
    id: value.id,
    deckId: value.deckId,
    kind: value.kind,
    category: value.category as Card["category"],
    fen: value.fen,
    side: value.side,
    prompt: text(value.prompt),
    hint: text(value.hint),
    answer,
    alternatives,
    explanation: text(value.explanation),
    continuation: text(value.continuation),
    notes: text(value.notes),
    tags,
    ...(isStr(value.sourceId) ? { sourceId: value.sourceId } : {}),
    ...(isNum(value.sourcePly) ? { sourcePly: value.sourcePly } : {}),
    ...(isStr(value.sourceCardId) ? { sourceCardId: value.sourceCardId } : {}),
    ...(isNum(value.struggles) ? { struggles: value.struggles } : {}),
    createdAt: when(value.createdAt, now),
    updatedAt: when(value.updatedAt, now),
  };
  // The position has to be real and the answer has to be playable from it.
  try {
    planCard(card);
  } catch {
    return null;
  }
  if (card.continuation.trim() !== "" && !checkContinuation(card.fen, card.continuation).ok) {
    card.continuation = "";
    counters.adjusted += 1;
  }
  return card;
}

function cleanSchedule(value: unknown): Schedule | null {
  if (!isObj(value) || !isStr(value.cardId)) return null;
  const { due, stability, difficulty, scheduledDays, learningSteps, reps, lapses, state } = value;
  if (![due, stability, difficulty, scheduledDays, learningSteps, reps, lapses].every(isNum)) return null;
  if (state !== 0 && state !== 1 && state !== 2 && state !== 3) return null;
  return {
    cardId: value.cardId,
    deckId: text(value.deckId),
    due: due as number,
    stability: stability as number,
    difficulty: difficulty as number,
    scheduledDays: scheduledDays as number,
    learningSteps: learningSteps as number,
    reps: reps as number,
    lapses: lapses as number,
    state,
    lastReview: isNum(value.lastReview) ? value.lastReview : null,
  };
}

const rating = (value: unknown): value is 1 | 2 | 3 | 4 => value === 1 || value === 2 || value === 3 || value === 4;

function cleanReview(value: unknown): ReviewEntry | null {
  if (!isObj(value) || !isStr(value.id) || value.id === "" || !isStr(value.cardId) || !isNum(value.reviewedAt)) return null;
  if (!rating(value.rating) || !rating(value.suggested) || !isStr(value.outcome) || !OUTCOMES.has(value.outcome)) return null;
  if (!isObj(value.timing) || !isObj(value.before) || !isObj(value.after)) return null;
  const timing = value.timing;
  if (![timing.activeMs, timing.idleMs, timing.hiddenMs, timing.elapsedMs].every(isNum)) return null;
  const after = value.after;
  if (![after.due, after.stability, after.difficulty, after.scheduledDays].every(isNum)) return null;
  // Everything else is kept as it was written. It is history, not something the app acts on.
  return { ...(value as unknown as ReviewEntry), deckId: text(value.deckId) };
}

function cleanSource(value: unknown, now: number): Source | null {
  if (!isObj(value) || !isStr(value.id) || value.id === "" || !isStr(value.pgn)) return null;
  const headers: Record<string, string> = {};
  if (isObj(value.headers)) for (const [key, entry] of Object.entries(value.headers)) if (isStr(entry)) headers[key] = entry;
  return { id: value.id, title: text(value.title), pgn: value.pgn, headers, createdAt: when(value.createdAt, now) };
}

function cleanMeta(value: unknown): MetaEntry | null {
  if (!isObj(value) || !isStr(value.key) || value.key === "") return null;
  return { key: value.key, value: value.key === "settings" ? normaliseSettings(value.value) : value.value };
}

/** Brings an older backup up to the current layout. Format 1 is the only one so far. */
function migrate(raw: Obj): Obj {
  return raw;
}

/** The first of each id, so a file that repeats a record doesn't clash with itself. */
function firstOf<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(key(item)) ? false : (seen.add(key(item)), true)));
}

/**
 * Reads backup text and checks every record. Records that can't be used are left out and counted,
 * so the person can see what would be lost before anything is changed. A file that isn't a backup at all is refused.
 */
export function readBackup(input: string, now = Date.now()): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return { ok: false, error: "That file isn't a RockChess backup. It couldn't be read as JSON." };
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) return { ok: false, error: "That file isn't a RockChess backup." };
  if (!isNum(raw.format) || !Number.isInteger(raw.format) || raw.format < 1) {
    return { ok: false, error: "That backup has no format number, so it can't be read safely." };
  }
  if (raw.format > BACKUP_FORMAT) {
    return { ok: false, error: `That backup was made by a newer version of RockChess (format ${raw.format}). Open the latest version and try again.` };
  }
  const source = migrate(raw);
  const data = source.data;
  if (!isObj(data) || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
    return { ok: false, error: "That backup is missing its decks or its cards." };
  }
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  const problems: Problems = { decks: 0, cards: 0, schedules: 0, reviews: 0, sources: 0, adjusted: 0 };
  const keep = <T>(items: unknown[], clean: (item: unknown) => T | null, counter: keyof Problems): T[] => {
    const out: T[] = [];
    for (const item of items) {
      const cleaned = clean(item);
      if (cleaned === null) problems[counter] += 1;
      else out.push(cleaned);
    }
    return out;
  };

  const decks = firstOf(keep(data.decks, (item) => cleanDeck(item, now), "decks"), (deck) => deck.id);
  const deckIds = new Set(decks.map((deck) => deck.id));
  const cards = firstOf(
    keep(data.cards, (item) => cleanCard(item, now, problems), "cards").filter((card) => {
      if (deckIds.has(card.deckId)) return true;
      problems.cards += 1;
      return false;
    }),
    (card) => card.id,
  );
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const sources = firstOf(keep(list(data.sources), (item) => cleanSource(item, now), "sources"), (item) => item.id);
  const sourceIds = new Set(sources.map((item) => item.id));
  for (const card of cards) if (card.sourceId && !sourceIds.has(card.sourceId)) delete card.sourceId;

  const schedules = firstOf(
    keep(list(data.schedules), cleanSchedule, "schedules").filter((item) => {
      if (cardById.has(item.cardId)) return true;
      problems.schedules += 1;
      return false;
    }),
    (item) => item.cardId,
  ).map((item) => ({ ...item, deckId: cardById.get(item.cardId)!.deckId }));
  const reviews = firstOf(
    keep(list(data.reviews), cleanReview, "reviews").filter((item) => {
      if (cardById.has(item.cardId)) return true;
      problems.reviews += 1;
      return false;
    }),
    (item) => item.id,
  ).map((item) => ({ ...item, deckId: cardById.get(item.cardId)!.deckId }));
  const meta = firstOf(list(data.meta).map(cleanMeta).filter((item): item is MetaEntry => item !== null), (item) => item.key);

  return {
    ok: true,
    problems,
    backup: {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: isStr(source.exportedAt) ? source.exportedAt : new Date(now).toISOString(),
      scope: source.scope === "deck" ? "deck" : "all",
      data: { decks, cards, sources, schedules, reviews, meta },
    },
  };
}

export const problemCount = (problems: Problems) =>
  problems.decks + problems.cards + problems.schedules + problems.reviews + problems.sources;

// ---------------------------------------------------------------- import

export type ImportMode = "merge" | "replace";

export type ImportSummary = {
  mode: ImportMode;
  decksAdded: number;
  /** Decks that were already here, so their cards went into the existing deck. */
  decksMerged: number;
  cardsAdded: number;
  /** Cards that were already here, by id or by position and answer. */
  cardsSkipped: number;
  /** Cards that got their progress from the file. */
  progressRestored: number;
  reviewsAdded: number;
};

const ALL_TABLES = [db.decks, db.cards, db.sources, db.schedules, db.reviews, db.meta];

/**
 * Puts a checked backup into the browser.
 *
 * "merge" only adds. A deck that is already here (same id, or the starter or Difficult moves deck) takes the new
 * cards; a deck whose name is taken by a different deck arrives as "Name (imported)". A card already here, by id or by
 * position and answer, stays as it is with its own progress. Settings and flags already here are kept.
 *
 * "replace" empties the browser first and is only allowed for a backup of everything.
 */
export async function importBackup(backup: Backup, mode: ImportMode): Promise<ImportSummary> {
  const { data } = backup;
  const summary: ImportSummary = { mode, decksAdded: 0, decksMerged: 0, cardsAdded: 0, cardsSkipped: 0, progressRestored: 0, reviewsAdded: 0 };

  if (mode === "replace") {
    if (backup.scope !== "all") throw new Error("Only a backup of everything can replace everything.");
    await db.transaction("rw", ALL_TABLES, async () => {
      for (const table of ALL_TABLES) await table.clear();
      await db.decks.bulkAdd(data.decks);
      await db.cards.bulkAdd(data.cards);
      await db.sources.bulkAdd(data.sources);
      await db.schedules.bulkAdd(data.schedules);
      await db.reviews.bulkAdd(data.reviews);
      await db.meta.bulkAdd(data.meta);
    });
    return { ...summary, decksAdded: data.decks.length, cardsAdded: data.cards.length, progressRestored: data.schedules.length, reviewsAdded: data.reviews.length };
  }

  await db.transaction("rw", ALL_TABLES, async () => {
    const now = Date.now();
    const localDecks = await db.decks.toArray();
    const localCards = await db.cards.toArray();
    const takenNames = new Set(localDecks.map((deck) => deck.name.toLowerCase()));
    const byDeck = new Map<string, Card[]>();
    for (const card of localCards) byDeck.set(card.deckId, [...(byDeck.get(card.deckId) ?? []), card]);
    const localById = new Map(localCards.map((card) => [card.id, card]));

    // Which deck here each deck in the backup goes into.
    const target = new Map<string, string>();
    const newDecks: Deck[] = [];
    for (const deck of data.decks) {
      const same =
        localDecks.find((item) => item.id === deck.id) ??
        (deck.theme ? localDecks.find((item) => item.theme === deck.theme) : undefined);
      if (same) {
        target.set(deck.id, same.id);
        summary.decksMerged += 1;
        continue;
      }
      let name = deck.name;
      for (let n = 1; takenNames.has(name.toLowerCase()); n += 1) name = n === 1 ? `${deck.name} (imported)` : `${deck.name} (imported ${n})`;
      takenNames.add(name.toLowerCase());
      target.set(deck.id, deck.id);
      newDecks.push({ ...deck, name, updatedAt: now });
      summary.decksAdded += 1;
    }
    if (newDecks.length > 0) await db.decks.bulkAdd(newDecks);

    // Which cards are new here, and which already are. `here` maps each card in the file to the card it is here.
    const newCards: Card[] = [];
    const here = new Map<string, Card>();
    for (const card of data.cards) {
      const deckId = target.get(card.deckId) as string;
      const there = byDeck.get(deckId) ?? [];
      const same = localById.get(card.id) ?? there.find((other) => sameCard(other, card));
      if (same) {
        summary.cardsSkipped += 1;
        here.set(card.id, same);
        continue;
      }
      const added = { ...card, deckId };
      newCards.push(added);
      byDeck.set(deckId, [...there, added]);
      here.set(card.id, added);
      summary.cardsAdded += 1;
    }
    if (newCards.length > 0) await db.cards.bulkAdd(newCards);
    const newIds = new Set(newCards.map((card) => card.id));

    const sourceIds = new Set(newCards.map((card) => card.sourceId).filter((id): id is string => Boolean(id)));
    const localSources = new Set(await db.sources.toCollection().primaryKeys());
    const sources = data.sources.filter((item) => sourceIds.has(item.id) && !localSources.has(item.id));
    if (sources.length > 0) await db.sources.bulkAdd(sources);

    // Progress comes with new cards. A card already here keeps its own, and only gets the file's if it has none.
    // That includes a card that is the same position and answer under a different id, which is what a fresh install
    // of the starter deck looks like after the browser's data was cleared.
    const hasProgress = new Set(await db.schedules.toCollection().primaryKeys());
    const adopted = new Map<string, string>(); // card id in the file -> card id here
    const taken = new Set<string>();
    const schedules: Schedule[] = [];
    for (const item of data.schedules) {
      const local = here.get(item.cardId);
      if (!local || taken.has(local.id)) continue;
      if (!newIds.has(local.id) && hasProgress.has(local.id)) continue;
      taken.add(local.id);
      adopted.set(item.cardId, local.id);
      schedules.push({ ...item, cardId: local.id, deckId: local.deckId });
    }
    if (schedules.length > 0) await db.schedules.bulkAdd(schedules);
    const localReviews = new Set(await db.reviews.toCollection().primaryKeys());
    const reviews = data.reviews
      .filter((item) => adopted.has(item.cardId) && !localReviews.has(item.id))
      .map((item) => {
        const local = here.get(item.cardId) as Card;
        return { ...item, cardId: local.id, deckId: local.deckId };
      });
    if (reviews.length > 0) await db.reviews.bulkAdd(reviews);
    summary.reviewsAdded = reviews.length;
    summary.progressRestored = schedules.length;

    const localMeta = new Set(await db.meta.toCollection().primaryKeys());
    const meta = data.meta.filter((item) => !localMeta.has(item.key));
    if (meta.length > 0) await db.meta.bulkAdd(meta);
  });
  return summary;
}
