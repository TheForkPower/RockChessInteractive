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

React, TypeScript, Vite, Tailwind CSS v4, React Router, chess.js (all chess rules), cm-chessboard (MIT, the board). Planned: Dexie, ts-fsrs.

## Structure

```
src/app        routes and the application shell
src/ui         shared components: buttons, feedback, icons
src/domain     chess logic with no React in it: FEN checks, game wrapper, move list, practice cards
src/board      the board component and its move-input handling
src/features   one folder per area (home, decks, create, settings, design)
src/styles     design tokens and component styles
```

The `/design` page shows every colour, type style and button. The `/create` page is a position lab: paste a FEN or play moves on the board. The home page has four practice cards from the Opera Game and the Immortal Game; they aren't saved or scheduled.

Board interaction (dragging, clicking, the promotion dialog) is tested at the logic level only. Check it by hand in a browser after changes to `src/board`.

Piece artwork licensing is unresolved: see `THIRD_PARTY_NOTICES.md`.
