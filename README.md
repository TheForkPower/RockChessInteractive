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

React, TypeScript, Vite, Tailwind CSS v4, React Router. Planned: chess.js, cm-chessboard (MIT), Dexie, ts-fsrs.

## Structure

```
src/app        routes and the application shell
src/ui         shared components: buttons, feedback, icons
src/features   one folder per area (home, decks, create, settings, design)
src/styles     design tokens and component styles
```

The `/design` page shows every colour, type style and button.
