# RockChess backup format

A backup is one JSON file. RockChess makes one from **Settings > Download backup** (everything) or **Export deck**
on a deck's page (one deck, with its cards and progress). The file can be restored from **Settings > Restore from a file**.

The current format number is **1**. The number goes up whenever the layout changes in a way an older reader couldn't
follow. A newer RockChess keeps reading older numbers; an older RockChess refuses a newer number and says so,
rather than guessing.

## Shape

```json
{
  "app": "rockchess",
  "format": 1,
  "exportedAt": "2026-11-21T14:30:00.000Z",
  "scope": "all",
  "data": {
    "decks": [],
    "cards": [],
    "sources": [],
    "schedules": [],
    "reviews": [],
    "meta": []
  }
}
```

| Field | Meaning |
| --- | --- |
| `app` | Always `"rockchess"`. Anything else is refused. |
| `format` | Whole number, 1 or more. |
| `exportedAt` | When the file was made, as an ISO 8601 date. |
| `scope` | `"all"` for everything in the browser, `"deck"` for one deck. Only `"all"` can replace what is in the browser. |
| `data` | The records, below. `decks` and `cards` must be present; the rest may be left out. |

## Records

Every record has an `id` (or `key`, or `cardId`) that the others refer to.

- **decks**: `id`, `name`, optional `description`, `color` (a deck colour id), `theme` (`"tutorial"` for the starter deck,
  `"difficult"` for the automatic Difficult moves deck), `createdAt`, `updatedAt` (milliseconds since 1970).
- **cards**: `id`, `deckId`, `kind` (`"move"` or `"line"`), `category` (`opening`, `tactic`, `endgame`, `strategy`,
  `defence` or `game`), `fen` (the position on the front), `side` (`"w"` or `"b"`, the colour the learner plays),
  `prompt`, `hint`, `answer` and `alternatives` (lists of moves, each `{ from, to, san }` with an optional
  `promotion` of `q`, `r`, `b` or `n`), `explanation`, `continuation` (PGN movetext from `fen`, with comments and
  variations), `notes` (older cards only; newer ones keep everything in `explanation`), `tags`, optional `sourceId`,
  `sourcePly`, `sourceCardId` and `struggles`, `createdAt`, `updatedAt`.
- **sources**: the PGN a card was made from. `id`, `title`, `pgn`, `headers`, `createdAt`.
- **schedules**: one per graded card, which is the FSRS memory of the card. `cardId`, `deckId`, `due`, `stability`,
  `difficulty`, `scheduledDays`, `learningSteps`, `reps`, `lapses`, `state` (0 new, 1 learning, 2 review, 3 relearning),
  `lastReview`. A card with no schedule is new.
- **reviews**: one per graded review, the history. `id`, `cardId`, `deckId`, `reviewedAt`, `rating` (what was pressed, 1 to 4),
  `suggested`, `grading` (`"manual"` or `"smart"`, missing on older lines), `outcome`, `phase`, `mistakes`, `hintUsed`,
  `revealed`, `playerMoves`, a `timing` block, the schedule `before` and `after`, `elapsedDays`, `desiredRetention`.
- **meta**: small things the app remembers: `settings` (the preferences) and flags such as `tutorialDeckAdded`, which stop
  the starter deck from being installed again.

## What is checked on the way in

Nothing is changed until the whole file has been read, and the person sees what was found first.

- The file must be JSON, with `app` set to `"rockchess"` and a `format` this version knows.
- `data.decks` and `data.cards` must be lists.
- Each record is checked on its own. One that can't be used is left out and counted: a deck with no name, a card whose
  position isn't a real position or whose answer can't be played from it, a schedule or review for a card that isn't in
  the file. A card with a `continuation` that can't be read is kept without it.
- Repeated ids keep the first record. A card has to belong to a deck in the file.

## Adding and replacing

- **Add to what I have** only adds. A deck that is already here (same id, or the starter or Difficult moves deck) takes
  the file's cards. A deck whose name is taken by a different deck arrives as "Name (imported)". A card already here,
  by id or by position and answer, is left alone with its own progress; if it has none yet, it takes the file's progress
  and history (this is what brings progress back onto a freshly installed starter deck after the browser's data was cleared).
  Settings already here are kept.
- **Replace everything** empties the browser and puts the file in its place. It only works for a file with
  `scope` `"all"`, and the person is warned and offered a backup of what they have first.

## Changing the format

Add a case to `migrate` in `src/data/backup.ts` that turns the older layout into the current one, raise `BACKUP_FORMAT`,
and add a test with a small file in the old layout.
