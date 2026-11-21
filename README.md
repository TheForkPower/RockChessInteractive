# RockChess

RockChess is a set of chess training tools. The first is **Recall**: spaced-repetition flashcards for chess positions and variations. Local-first: all data lives in your browser (IndexedDB). No backend, accounts or paid services.

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

React, TypeScript, Vite, Tailwind CSS v4, React Router, chess.js (all chess rules), cm-chessboard (MIT, the board). Dexie (IndexedDB), ts-fsrs (the FSRS scheduler).

## Structure

```
src/app        routes and the application shell
src/ui         shared components: buttons, feedback, icons
src/domain     logic with no React in it: FEN checks, game wrapper, PGN move tree, card model, scheduling (FSRS), response timing, settings
src/board      the board component and its move-input handling
src/moves      clickable move notation and the step-through viewer
src/data       Dexie database and the functions that read and write decks, cards, schedules, review history and settings
src/features   one folder per area (home, decks, create, cards, settings, design)
src/styles     design tokens and component styles
```

The `/design` page shows every colour, type style and button.

## What works so far

- **Home** (`/`): a heading and one box, which goes to Decks. More boxes will join it as the site grows. The header has a **Tools** menu; its only entry for now is **Recall** (`/recall`), the landing page for learning and reviewing cards. Unknown addresses show an "Illegal move!" page.
- **Create** (`/create`): it first asks how you want to start (paste a FEN, paste or upload a PGN, or use the board editor), then shows only that. You can set a position with a FEN, type or paste moves, paste or open a PGN (several games are fine), or play on the board. Everything goes into one move tree, so comments and variations are kept. From any position you can make a card, or turn the whole line into a deck (a card for each of your moves, or one card for the line).
- **Cards** hold a position, a question, an answer (one move, or a line), other accepted moves, an explanation, notes, and a PGN continuation. The continuation keeps the PGN's variations and comments, and every move in it is clickable.
- **Board editor** (the third way to start on Create): drag pieces from the palette onto the board, drag them between squares, or drag one off the board to remove it (clicking works too). It can load a FEN and copy the FEN it has made. You can also set whose turn it is, set whose turn it is, tick castling rights (only offered while the king and rook are at home) and the move number. It checks the position the same way as a pasted FEN, and "Use this position" makes it the start of the line.
- **Decks** (`/decks`): every deck is a coloured pack. A tile shows the deck's name, card count and how many cards are due and new, with **Review** and **Learn** buttons, and a three-dot menu with Edit cards, Rename, Change colour and Delete deck. Opening a deck shows a banner in its colour and all its cards. Each card says whether it is new or when it is due, and has an Open button and a three-dot menu with Edit, Mark as difficult and Delete. Opening a card shows its progress (next review, reviews, lapses, recall chance, FSRS stability and difficulty, and its history) with a **Reset progress** button. There are ten colours; new decks take one nobody else is using. Everything is saved in the browser's IndexedDB.
- **Review** (`/review?deck=ID`): one card at a time. The question is on the board, you play the answer, and a wrong move is sent back for another try. Single-move cards check one move, plus any other accepted moves saved on the card. Line cards check each of your moves in turn and play the opponent's replies for you. Hint and Show answer are there; Show answer waits until you have tried a move. The title, card count and End session share one short line so the whole card fits on a laptop screen. The question has a large "White to move" heading with the rest of the question smaller below. When a card ends you see the answer, the explanation and the grade buttons beside the board; the moves in the answer and in the explanation (including moves written like `18. Bd6 $1 {comment} 18... Bxg1`) are buttons that put the board on that move. At the end there is a summary.
  - **Scheduling (M4).** Review goes through the cards that are due (longest overdue first), then up to 10 new ones. After each card you press **Again, Hard, Good or Easy**, each showing when the card would come back. That grade goes to FSRS (ts-fsrs, whole-day gaps, no fuzz, so the previews are exact) and the schedule is saved in IndexedDB: due date, interval, stability, difficulty, reps and lapses. Every review is also saved in a history table. The 10-new-cards limit is a stand-in until daily limits arrive in milestone 5.
  - **Suggested grade.** One button is marked "Suggested", with the reason beside the buttons: right first time is Good, a hint or second try is Hard, part right or answer shown is Again. You always choose; what you press is what FSRS gets.
  - **Response time.** The timer starts when the question appears (in Learn, when you start playing), and records the first move and the finish. A pause longer than the idle limit (30 s by default) only counts up to the limit; the rest is idle. Time with the tab hidden is kept apart. A card with 5 s or more hidden, 60 s or more idle, or over 10 minutes of thinking is flagged as not reliable and its time is left out of everything. Timing is stored in its own block on each history line, apart from the rating.
  - **Time as a signal.** If it is on (Settings), a first-try answer that took half your usual time per move or less (needs 8 earlier timings) is suggested as Easy instead of Good. It never goes down for a slow answer. The history line keeps the pressed rating, the suggested rating, and whether time moved the suggestion.
  - **Practise** (`&practice=1`, and the "Practise anyway" button when nothing is due): every card in the deck, nothing graded or saved. "Nothing due" says when the next card comes back.
- **Learn** (`&mode=learn`): only cards you haven't seen. Each starts with its answer, explanation and moves on show, then asks you to play it from memory, and is graded like Review. This is a simple version; the full learning mode with daily limits comes in milestone 5.
- **Settings** (`/settings`): how much you want to remember (80, 85, 90 or 95%; FSRS's desired retention), whether time can lift the suggestion to Easy, and how long a pause counts as thinking. Backup and restore arrive in milestone 6.
- **Famous moves**: a starter deck of nine cards from well-known games (Légal, Anderssen, Morphy, Lasker, Réti, Byrne v Fischer, Deep Blue, Kasparov v Topalov), in the ember colour. It is added on the first visit, can be edited or deleted like any deck, and is not added again once deleted. The Decks page offers a button to add it back. The moves are checked against chess.js in `src/data/tutorialDeck.test.ts`; the explanations are written from memory of the games and are worth a read before release.
- **Difficult moves**: an orange deck that fills itself. A card is copied into it when, on the first go, you needed the answer shown or got the move wrong twice. A card already there gains a count each time it gives trouble again, and the deck puts the worst first. You can add a card yourself with "Mark as difficult" (on the back of a card in Review, or in a deck's card list) and delete cards from it like any other. On the Decks page it sits below the other decks as a small strip (with "This deck has no cards yet. Make some bad moves and it will be filled! :)" while empty). It is made on the first visit and comes back the next time a card gives trouble if you delete it.
- **Recall page**: four practice cards from the Opera Game and the Immortal Game. They aren't saved or scheduled.

PGN text is read by `src/domain/pgn.ts`, which only handles the shape of PGN (move numbers, variations, comments). Every move goes through chess.js, which decides whether it is legal.

Board dragging and clicking, and the promotion dialog, were checked by hand in a browser at the end of M1. The M2 screens are covered by tests but haven't had the same hand check.

Piece artwork licensing is unresolved: see `THIRD_PARTY_NOTICES.md`.
