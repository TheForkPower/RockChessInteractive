# IMPORTANT: PROTOTYPE SCOPE — BUILD ONLY THE ANKI-STYLE CHESS LEARNING SYSTEM

For this prototype, I want you to focus EXCLUSIVELY on the Anki-style chess flashcard and spaced-repetition system.

Do not build:

- Chess Genome.
    
- Boss Battles.
    
- Opening Survival.
    
- Chess Time Machine.
    
- Social features.
    
- Tournament management.
    
- General chess analytics dashboards.
    
- Any unrelated chess utilities.
    

The entire prototype should revolve around one excellent experience: importing chess material, turning it into flashcards, learning it, reviewing it and remembering it.

I want something that combines the strengths of Anki and Chessable, but is designed specifically for chess positions and variations.

The application must remain local-first, using IndexedDB. No backend, authentication, paid APIs or cloud infrastructure.

---

# 1. THE CORE EXPERIENCE

The user should be able to:

1. Open RockChess Recall.
    
2. Create a deck.
    
3. Paste a PGN, enter a FEN or create a position manually.
    
4. Turn that material into a flashcard.
    
5. Add an explanation and/or a continuation in PGN format.
    
6. Study the card interactively on a chessboard.
    
7. Have their performance assessed using correctness, response time and review history.
    
8. Receive the card again at an intelligently calculated time.
    

The interface should make this process extremely straightforward.

# 2. IMPORTING AND CREATING FLASHCARDS

This is one of the most important features.

Create a dedicated, simple card-creation interface.

### PGN input

Users should be able to paste a PGN directly into a large text box.

The application should:

- Parse the PGN correctly.
    
- Display the game on an interactive chessboard.
    
- Allow the user to navigate through the game.
    
- Allow the user to select any position as the starting point of a flashcard.
    
- Preserve the side to move, castling rights and other relevant position information.
    
- Allow the user to select whether the card asks for one move or a sequence of moves.
    

For example, a user pastes a complete opening variation and selects the position after 1.e4 c5 2.Nf3 d6.

That position becomes the front of a flashcard.

The user should not have to manually construct the FEN.

### FEN input

Users should also be able to paste a FEN directly.

The application should:

- Validate the FEN.
    
- Display the resulting position.
    
- Allow the user to configure the question and answer.
    
- Save the position as a flashcard.
    

### Manual board editor

Allow users to construct positions manually on a chessboard.

This can be a later refinement, but the architecture should accommodate it.

# 3. FLASHCARD CONTENT AND INTERACTIVE EXPLANATIONS

Each flashcard should support the following:

**Front:**

- Chess position.
    
- Question or instruction.
    
- Optional hints.
    

**Back:**

- Correct move or sequence.
    
- Textual explanation.
    
- Optional PGN continuation.
    
- Optional additional notes.
    

The user should be able to write an explanation in ordinary text, for example:

"The key idea is to control e5 before developing the bishop. Black should avoid exchanging the dark-squared bishop unnecessarily."

They should also be able to paste a PGN continuation.

### Clickable chess moves

This is a particularly important feature.

If a user adds a PGN continuation to the back of a card, the application should display the moves in a readable, interactive notation format.

Every move should be clickable.

When the user clicks a move:

- The chessboard should jump to the corresponding position.
    
- The selected move should be highlighted.
    
- The board should update correctly.
    
- The user should be able to navigate forwards and backwards through the continuation.
    

The explanation and PGN should appear neatly below the board.

Think of the presentation of a Chessable course: a clear board, readable variations, and the ability to click individual moves to follow the analysis.

Use chess.js to validate and replay the PGN. Do not implement move parsing manually.

The card editor should make it easy to add, edit and remove explanations and PGN variations.

# 4. THE REVIEW EXPERIENCE

This should be the centrepiece of the entire application.

The user enters a review session and sees one card at a time.

The board should be prominent, with minimal distractions.

The user should:

1. Read the question.
    
2. Consider the position.
    
3. Play their answer directly on the board.
    
4. Receive immediate feedback.
    
5. See the correct continuation and explanation.
    
6. Grade how well they remembered the position.
    

The grading interface should use large, attractive buttons:

- Again
    
- Hard
    
- Good
    
- Easy
    

Do not reveal the answer before the user attempts it.

For sequence cards, allow the user to play the required continuation move by move.

For single-move cards, assess whether the move played matches an accepted answer.

Where appropriate, allow multiple acceptable moves to be stored for a card.

The application should distinguish between:

- Correct move.
    
- Incorrect move.
    
- Partially correct sequence.
    
- Correct move but incorrect continuation.
    

Do not claim to evaluate strategic understanding automatically unless a genuine evaluation method exists.

# 5. INTELLIGENT TIMING AND SPACED REPETITION

This is a major feature and should distinguish RockChess Recall from a basic flashcard application.

Use FSRS for the underlying scheduling algorithm.

However, I also want the application to consider how long a user takes to solve each card.

### Response-time tracking

Record:

- When the card first appears.
    
- When the user makes their first move.
    
- When they complete their answer.
    
- Total active response time.
    
- Whether the answer was correct.
    
- The user's eventual difficulty rating.
    

Use these measurements to improve scheduling.

For example:

- A correct answer given quickly and confidently may justify a longer review interval.
    
- A correct answer that takes unusually long may indicate weaker recall and justify a shorter interval.
    
- An incorrect answer should normally be reviewed sooner.
    
- A card repeatedly answered correctly and quickly should gradually become less frequent.
    

However, response time must NOT be used naively.

### Detecting inactivity and anomalies

Implement basic inactivity detection.

For example:

- If the user leaves a card open without interacting for a long time, do not count all of that time as thinking time.
    
- Detect browser tab visibility changes.
    
- Detect prolonged inactivity.
    
- Pause or exclude idle time where appropriate.
    
- Flag unusually long sessions as potentially unreliable.
    

Do not automatically punish users for taking longer.

A user might genuinely be calculating a difficult chess position.

The aim is to distinguish genuine thinking time from inactivity, not to pressure the user into playing quickly.

### Scheduling adjustments

Use FSRS as the primary scheduling system.

Use response time as an additional signal to inform the user's rating or scheduling parameters, rather than inventing an entirely separate scheduling algorithm.

Make the logic transparent and configurable.

Keep the original FSRS rating available to the user and store timing information separately so that scheduling decisions can be reviewed and adjusted later.

The scheduling system must persist across browser sessions.

# 6. MIX LEARNING WITH REVIEW — CHESSABLE-STYLE

I do not want the application to be purely a system that shows old cards due for review.

I want to combine **learning new material and reviewing old material**.

Take inspiration from Chessable's MoveTrainer.

The system should have two related activities:

### Learn

When a user creates or imports a new deck, they should be able to learn its cards in a structured way.

For example:

- Introduce a new position.
    
- Show the correct move.
    
- Explain the idea.
    
- Allow the user to play through the variation.
    
- Ask the user to reproduce the move or sequence.
    
- Mark the material as learned and schedule its first review.
    

Learning should be interactive rather than simply displaying the answer.

### Review

The review system should bring back previously learned material according to its FSRS schedule.

It should prioritise cards that are due, overdue or need reinforcement.

### Combined daily session

The home screen should have a prominent button such as:

**Start Learning & Review**

This should intelligently combine:

- Due reviews.
    
- Overdue cards.
    
- A manageable number of new cards.
    

Allow users to control how many new cards they introduce per day.

Do not introduce too many new cards at once.

The application should make it clear how much material is due and how many new cards are available.

# 7. DECK MANAGEMENT

Users should be able to:

- Create decks.
    
- Rename decks.
    
- Delete decks.
    
- Add cards to decks.
    
- Move cards between decks.
    
- Tag cards.
    
- Search cards.
    
- Browse individual cards.
    
- View how many cards are new, learning, due and mastered.
    

Keep the interface simple and attractive.

Do not turn this into a complicated database interface.

# 8. LOCAL STORAGE AND DATA PORTABILITY

Continue to use IndexedDB through Dexie.

Persist:

- Decks.
    
- Cards.
    
- FEN positions.
    
- PGN variations.
    
- Textual explanations.
    
- Review history.
    
- Response times.
    
- FSRS scheduling information.
    
- Learning progress.
    
- User settings.
    

Implement JSON backup and restoration.

The user should be able to export their entire collection and restore it later.

# 9. DESIGN REQUIREMENTS

The interface must follow the original visual brief:

- Minimalist.
    
- Duolingo-style rounded buttons.
    
- MathsGenie-like simplicity.
    
- Clean, neat background.
    
- Restrained colours.
    
- Clear typography.
    
- Attractive interactive chessboard.
    
- Excellent spacing.
    
- No unnecessary menus or statistics.
    

The review screen should be particularly polished.

The user should always know:

- What position they are studying.
    
- What they need to do.
    
- Whether they got it right.
    
- What the correct answer is.
    
- When they will see the card again.
    

# 10. DEVELOPMENT MILESTONES

Build in this exact order:

**M0 — Application foundation**

- Set up React, TypeScript and Vite.
    
- Establish the design system.
    
- Build the navigation and application shell.
    

**M1 — Chessboard and position handling**

- Integrate the chessboard.
    
- Implement FEN input.
    
- Implement legal move handling.
    
- Test board interaction.
    

**M2 — Card creation**

- Build PGN importing.
    
- Allow users to select positions from a PGN.
    
- Build FEN-based card creation.
    
- Add explanations and PGN continuations.
    
- Implement clickable move notation.
    

**M3 — Review engine**

- Build the front/back flashcard experience.
    
- Allow users to play moves.
    
- Implement answer checking.
    
- Add explanations and feedback.
    

**M4 — Spaced repetition**

- Integrate FSRS.
    
- Record response times.
    
- Implement inactivity detection.
    
- Adjust scheduling using reliable performance signals.
    

**M5 — Learning mode**

- Introduce new material interactively.
    
- Implement the combined learning and review session.
    
- Add daily new-card limits.
    

**M6 — Deck management and persistence**

- Implement deck organisation.
    
- Ensure IndexedDB persistence.
    
- Implement JSON backup and restore.
    

**M7 — Final polish**

- Test the complete application.
    
- Fix bugs.
    
- Improve responsiveness.
    
- Ensure the visual design is consistent.
    

Stop for my review after M3, M5 and M7.

# 11. IMPORTANT DEVELOPMENT RULES

- Work only on the Anki-style chess learning system.
    
- Do not start building unrelated features.
    
- Do not build a fake prototype with non-functional buttons.
    
- Do not invent chess evaluations.
    
- Use established chess libraries.
    
- Validate PGNs and FENs.
    
- Test move legality and board state.
    
- Ensure timing measurements are reliable.
    
- Ensure scheduling is persistent.
    
- Do not let inactivity distort response-time data.
    
- Keep the application local-first.
    
- Do not introduce paid services.
    

The first usable release should allow me to import a PGN, select a position, create a flashcard with an explanation and clickable continuation, learn it, review it and have it scheduled intelligently.

**The vision: Anki meets Chessable, with a genuinely excellent chessboard-based learning experience.**


---

# Build RockChess Recall — Anki for Chess

You are an expert full-stack developer, product designer and UX engineer. Build a polished, functional chess-learning web application for **Rockchess.com**, called **RockChess Recall**.

The central idea is simple: **Anki, but for chess positions.** Users build long-term chess understanding through active recall, spaced repetition and interactive chess challenges.

This should feel like a genuinely exciting product for chess players, not a generic chess database or a conventional chess-training website.

## 1. Design philosophy and visual identity

The design is extremely important.

I want a **minimalist, clean, Duolingo-style interface**, with the simplicity and accessibility of MathsGenie, but adapted for chess.

The interface should have:

- Large, clear, rounded buttons with a satisfying, slightly playful feel.
    
- A neat, uncluttered background. Use subtle off-white, very light grey or another restrained neutral background.
    
- A limited colour palette. Choose one strong primary accent colour, with restrained secondary colours for success, errors and progress.
    
- Clear typography and excellent spacing.
    
- Simple icons where useful.
    
- Subtle hover states, transitions and feedback animations.
    
- A consistent visual language throughout the application.
    
- A responsive layout that works properly on desktop, tablet and mobile.
    

**Avoid:**

- A dark, overly technical chess-engine aesthetic.
    
- Excessive gradients, glassmorphism or visual clutter.
    
- Complicated dashboards full of statistics.
    
- Tiny buttons, dense tables and unnecessary text.
    
- The appearance of an enterprise SaaS product.
    
- Generic AI-generated website styling.
    

Think: Duolingo's approachable buttons and progression, MathsGenie's simplicity, and a modern chess application.

The chessboard should be a central visual feature, not an afterthought. It must be clear, attractive and easy to interact with.

The product should feel enjoyable to use even when someone is doing a short five-minute revision session.

## 2. Main feature: RockChess Recall

The core feature is a spaced-repetition system for chess positions.

Users should be able to create and review cards containing chess positions, just as they would in Anki.

### Card creation and importing

Allow users to create cards from:

- A FEN position.
    
- A PGN game.
    
- A manually selected position on an interactive chessboard.
    
- An opening repertoire or collection of positions.
    

The initial implementation should prioritise FEN and PGN importing, while keeping the architecture flexible enough to support repertoire importing later.

When importing a PGN:

- Parse the game correctly.
    
- Allow the user to select positions from the game.
    
- Generate cards from selected positions.
    
- Preserve the correct side to move.
    
- Store relevant metadata, including the game, move number and source.
    

Users should be able to edit, delete, organise and tag their cards.

### Reviewing cards

The review experience should be the centrepiece of the website.

A typical review should work as follows:

1. Display a chess position on a large, attractive interactive board.
    
2. Ask the user to find the best move or sequence.
    
3. Allow the user to make a move directly on the board.
    
4. Check the answer using a chess engine where appropriate.
    
5. Give immediate, clear feedback.
    
6. Explain the correct move and the relevant idea.
    
7. Ask the user to grade how well they remembered the position.
    
8. Schedule the next review using a spaced-repetition algorithm.
    

The review interface should be extremely simple. The user should immediately understand what to do.

Use large, clear buttons for grading:

- Again
    
- Hard
    
- Good
    
- Easy
    

Implement a proper spaced-repetition system. Prefer FSRS if practical, rather than inventing a simplistic scheduling algorithm.

The system should store:

- Review history.
    
- Previous grades.
    
- Next review date.
    
- Interval.
    
- Difficulty and stability parameters where supported by the scheduling algorithm.
    

The scheduler must persist between browser sessions and page reloads.

### Types of cards

Build the system so that cards can eventually support different training modes:

- **Opening Recall:** Find the correct repertoire move.
    
- **Tactics:** Find the winning combination.
    
- **Endgames:** Find the correct continuation.
    
- **Strategic Positions:** Identify the best plan or positional idea.
    
- **Defence:** Find the best defensive resource.
    
- **Move Orders:** Remember the correct sequence of moves.
    

Do not make every card type a completely separate application. Build a flexible card system with different answer and evaluation modes.

## 3. Personal game analysis and automatic card generation

One of the most interesting future features is the ability to import a player's own games and turn them into personalised revision material.

Eventually, users should be able to upload a collection of PGNs and have the application identify:

- Positions where they repeatedly make mistakes.
    
- Opening positions they frequently encounter.
    
- Critical positions they have forgotten.
    
- Recurring tactical patterns.
    
- Endgames they struggle to convert.
    
- Positions where they consistently spend a lot of time.
    

These should become suggested revision cards.

For the first version, focus on reliable PGN importing and manually selecting positions. Do not pretend that an automatic analysis system can identify weaknesses accurately without actually analysing the games.

## 4. Additional features and future expansion

Keep the architecture modular so that the following features can be added later.

### Opening Survival

A challenge mode where the player is given a position from an opening repertoire and must find the correct continuation.

The player progresses through increasingly difficult positions, with limited lives and a score.

### Chess Boss Battles

A series of themed chess challenges. For example:

- Tactical awareness.
    
- Defensive technique.
    
- Opening knowledge.
    
- Endgame technique.
    
- Calculation.
    

Each challenge should feel like a small, structured campaign.

### Chess Genome

A personal chess profile generated from a player's imported games.

It could eventually identify tendencies such as:

- Tactical versus positional strengths.
    
- Opening preferences.
    
- Typical strategic mistakes.
    
- Endgame performance.
    
- Performance in different types of positions.
    

Only display conclusions that are genuinely supported by the available data.

### Opening Blindfold

A challenge where users must recall a sequence of moves without seeing the board, then check their answer.

### Chess Time Machine

A historical game challenge where the user plays through a famous game one move at a time, predicts the next move and compares their decision with the historical game.

These are future modules. Do not let them distract from building the core Recall experience properly.

## 5. Chess functionality

Chess logic must be accurate.

Use established libraries rather than writing a chess engine or move-validation system from scratch.

Suggested technologies:

- chess.js for move legality, PGN parsing and position handling.
    
- Chessground or another reliable interactive chessboard library.
    
- Stockfish WASM for engine evaluation.
    
- FSRS for spaced repetition.
    

The board must:

- Display all pieces correctly.
    
- Support drag-and-drop and click-to-move.
    
- Highlight legal moves where appropriate.
    
- Support promotions.
    
- Handle castling and en passant.
    
- Display the correct side to move.
    
- Support FEN positions and PGN games.
    
- Work properly on mobile.
    

Engine evaluation should be used where appropriate, but do not require engine analysis for every simple opening recall card. The card's evaluation mode should determine how answers are checked.

## 6. Technical architecture: local-first

**This is a strict requirement for the initial version.**

Build the entire first version as a local-first web application. I want to be able to run it on my computer, use it, close the browser, reopen it and find all my data intact.

Use:

- React.
    
- TypeScript.
    
- Vite.
    
- Tailwind CSS.
    
- chess.js.
    
- Chessground.
    
- Stockfish WASM.
    
- FSRS.
    
- Browser local storage or IndexedDB.
    

### Data persistence

Use **IndexedDB as the preferred storage solution** for the main application data, because PGNs, card collections and review histories may become relatively large.

Use localStorage only for small preferences where appropriate.

Persist:

- All decks.
    
- All cards.
    
- FEN positions.
    
- PGN source data and metadata.
    
- Review history.
    
- FSRS scheduling information.
    
- Tags and categories.
    
- User preferences.
    
- Progress statistics.
    

Data must survive page reloads and browser restarts.

Do not use in-memory state as the only storage mechanism.

### No backend initially

Do not implement:

- Supabase.
    
- Firebase.
    
- Authentication.
    
- User accounts.
    
- Cloud databases.
    
- Paid APIs.
    
- Server-side storage.
    
- Subscription systems.
    

Do not introduce unnecessary hosting or infrastructure costs.

The application should run entirely in the browser after installation or initial loading, wherever technically practical.

### Data portability

This is important. Users must own their chess data.

Implement:

- Export all data as a downloadable JSON backup.
    
- Import a previously exported JSON backup.
    
- Export individual decks.
    
- Import PGN files.
    
- Validate imported backups before overwriting or merging existing data.
    
- Provide a clear warning before destructive operations.
    

The backup format should be documented and versioned, so future updates do not make old backups unusable.

### Future cloud migration

Although the first version must be local-only, structure the application so that a cloud backend can be added later without rewriting the entire application.

Separate data access from UI components. Use a repository or storage abstraction, for example:

- `CardRepository`
    
- `DeckRepository`
    
- `ReviewRepository`
    
- `SettingsRepository`
    

Initially, these should use IndexedDB implementations.

Keep business logic independent of the storage implementation.

Do not build a complicated abstraction framework. The goal is a clean and straightforward architecture, not unnecessary engineering.

## 7. Pages and navigation

Keep navigation simple.

**Home**

- Welcome message.
    
- A prominent button to start reviewing.
    
- Number of cards due today.
    
- A simple progress indicator.
    
- Quick access to decks and challenges.
    

**Review**

- The main interactive chessboard.
    
- The current question.
    
- Answer submission and feedback.
    
- Spaced-repetition grading buttons.
    

**My Decks**

- List of decks.
    
- Number of cards in each deck.
    
- Cards due.
    
- Create and import options.
    

**Create Cards**

- FEN input.
    
- PGN upload/import.
    
- Board editor.
    
- Position preview.
    
- Save card.
    

**Progress**

- Cards reviewed.
    
- Current review streak.
    
- Upcoming reviews.
    
- Accuracy over time.
    

**Settings**

- Export backup.
    
- Import backup.
    
- Data management.
    
- Basic preferences.
    

Do not overload the navigation with unnecessary sections.

## 8. Development priorities

Build in this order:

1. Inspect the existing repository and establish the project structure.
    
2. Establish the visual design system and overall application layout.
    
3. Build a fully functional interactive chessboard.
    
4. Implement FEN-based card creation.
    
5. Implement IndexedDB persistence.
    
6. Implement the review workflow.
    
7. Implement FSRS scheduling and persistent review history.
    
8. Implement PGN importing and position selection.
    
9. Add progress tracking.
    
10. Implement reliable backup and restore.
    
11. Prepare the architecture for future challenge modes and cloud migration.
    

Prioritise a working, polished core experience over a large number of incomplete features.

## 9. Quality requirements

- Every button must work.
    
- No placeholder functionality presented as complete.
    
- No fake statistics or invented engine evaluations.
    
- No broken chess positions or illegal move handling.
    
- No unnecessary loading screens.
    
- Good error handling for invalid FENs and PGNs.
    
- Persist user data reliably.
    
- Make the interface responsive.
    
- Use accessible contrast and readable text.
    
- Keep the code clean and modular.
    
- Test backup and restore functionality.
    
- Test persistence after refreshing and restarting the browser.
    

If a feature cannot be implemented properly in the current development stage, make that clear rather than simulating functionality.

## 10. First task

Before writing large amounts of code, inspect the existing repository and understand its structure.

Then:

1. Propose a concise implementation plan.
    
2. Establish the visual design system.
    
3. Build the first functional version of RockChess Recall.
    

The first milestone should be a beautiful, working experience where a user can:

- Create a chess position.
    
- Save it as a card.
    
- Review it on an interactive chessboard.
    
- Receive feedback.
    
- Grade their recall.
    
- Have the next review scheduled.
    
- Close the browser and return later to find their data intact.
    

Also implement a working JSON backup and restore system.

**The overall goal:** Make chess revision as intuitive and satisfying as Duolingo, but with the depth and precision required by serious chess players. Start locally, keep costs at zero during development, and leave cloud functionality for a later version.