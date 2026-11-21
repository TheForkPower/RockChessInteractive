# RockChess Recall

Spaced-repetition flashcards for chess positions and variations. Local-first: all data lives in your browser (IndexedDB). No backend, accounts or paid services.

The full specification is in `prompt.md`. Progress is tracked by milestone (M0 to M7).

## Run it

Requires Node 22 or newer and pnpm.

```sh
pnpm install
pnpm dev        # start the dev server
pnpm test       # unit tests
pnpm lint
pnpm typecheck
pnpm build      # production build into dist/
```

If `node_modules` was created on another operating system, delete it and run `pnpm install` again.

## Stack

React, TypeScript, Vite, Tailwind CSS v4, React Router, chess.js (all chess rules), cm-chessboard (MIT, the board). Dexie (IndexedDB). Planned: ts-fsrs.

## Structure

```
src/app        routes and the application shell
src/ui         shared components: buttons, feedback, icons
src/domain     chess logic with no React in it: FEN checks, game wrapper, PGN move tree, card model, practice cards
src/board      the board component and its move-input handling
src/moves      clickable move notation and the step-through viewer
src/data       Dexie database and the functions that read and write decks and cards
src/features   one folder per area (home, decks, create, cards, settings, design)
src/styles     design tokens and component styles
```

The `/design` page shows every colour, type style and button.

## What works so far

- **Create** (`/create`): set a position with a FEN, type or paste moves, paste or open a PGN (several games are fine), or play on the board. Everything goes into one move tree, so comments and variations are kept. From any position you can make a card, or turn the whole line into a deck (a card for each of your moves, or one card for the line).
- **Cards** hold a position, a question, an answer (one move, or a line), other accepted moves, an explanation, notes, and a PGN continuation. The continuation keeps the PGN's variations and comments, and every move in it is clickable.
- **Decks** (`/decks`): list, open, edit, delete and rename. Everything is saved in the browser's IndexedDB.
- **Home**: four practice cards from the Opera Game and the Immortal Game. They aren't saved or scheduled.

PGN text is read by `src/domain/pgn.ts`, which only handles the shape of PGN (move numbers, variations, comments). Every move goes through chess.js, which decides whether it is legal.

Board dragging and clicking, and the promotion dialog, were checked by hand in a browser at the end of M1. The M2 screens are covered by tests but haven't had the same hand check.

Piece artwork licensing is unresolved: see `THIRD_PARTY_NOTICES.md`.
