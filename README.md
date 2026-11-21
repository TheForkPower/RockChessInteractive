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
- **Board editor** (Create, then "Set up the board by hand"): place and remove pieces, move them about, set whose turn it is, tick castling rights (only offered while the king and rook are at home) and the move number. It checks the position the same way as a pasted FEN, and "Use this position" makes it the start of the line.
- **Decks** (`/decks`): every deck is a coloured pack. A tile shows the deck's name and card count with **Review** and **Learn** buttons, and a three-dot menu with Edit cards, Rename, Change colour and Delete deck. Opening a deck shows a banner in its colour and all its cards, which can be opened, edited and deleted. There are ten colours; new decks take one nobody else is using. Everything is saved in the browser's IndexedDB.
- **Review** (`/review?deck=ID`): one card at a time. The question is on the board, you play the answer, and a wrong move is sent back for another try. Single-move cards check one move, plus any other accepted moves saved on the card. Line cards check each of your moves in turn and play the opponent's replies for you. Hint and Show answer are there; Show answer waits until you have tried a move. When a card ends you see the answer, the explanation and the clickable continuation, then the next card, and at the end a summary. Each card is marked as right first time, right with help, part right, or answer shown. Nothing is saved or scheduled yet (milestone 4), and cards go through in the order they were made.
- **Learn** (`&mode=learn`): the same screen, but each card starts with its answer, explanation and moves on show, then asks you to play it from memory. This is a simple version; the full learning mode with daily limits comes in milestone 5.
- **Famous moves**: a starter deck of nine cards from well-known games (Légal, Anderssen, Morphy, Lasker, Réti, Byrne v Fischer, Deep Blue, Kasparov v Topalov), in the ember colour. It is added on the first visit, can be edited or deleted like any deck, and is not added again once deleted. The Decks page offers a button to add it back. The moves are checked against chess.js in `src/data/tutorialDeck.test.ts`; the explanations are written from memory of the games and are worth a read before release.
- **Home**: four practice cards from the Opera Game and the Immortal Game. They aren't saved or scheduled.

PGN text is read by `src/domain/pgn.ts`, which only handles the shape of PGN (move numbers, variations, comments). Every move goes through chess.js, which decides whether it is legal.

Board dragging and clicking, and the promotion dialog, were checked by hand in a browser at the end of M1. The M2 screens are covered by tests but haven't had the same hand check.

Piece artwork licensing is unresolved: see `THIRD_PARTY_NOTICES.md`.
