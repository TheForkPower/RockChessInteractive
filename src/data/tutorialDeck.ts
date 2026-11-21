import { draftFromPosition, parseAlternatives, type CardDraft } from "../domain/cards";
import { START_FEN } from "../domain/fen";
import { mainlineFrom, moveLabel, parseMovetext, serializeFrom, type LineTree } from "../domain/pgn";
import { IMMORTAL_GAME, OPERA_GAME } from "../domain/practiceCards";

export const TUTORIAL_DECK_NAME = "Famous moves";
export const TUTORIAL_DECK_DESCRIPTION =
  "Ten of the most celebrated moves in chess history. Start here to see how cards work.";

type Spec = {
  /** The whole game, or the part of it the card needs, as PGN movetext. */
  game: string;
  /** Index in the main line of the move you are asked to find. 0 is White's first move. */
  ply: number;
  /** The move expected there. Checked when the deck is built, so a slip in `ply` can't go unnoticed. */
  answer: string;
  kind: "move" | "line";
  /** For a line card: how many half-moves to recall, counting the opponent's. */
  lineLength?: number;
  /** How many half-moves of the game to show on the back. Everything, if left out. */
  showPlies?: number;
  prompt: string;
  hint: string;
  explanation: string;
  notes: string;
  alsoAccept?: string;
  category: CardDraft["category"];
};

const numbered = (moves: string[]) =>
  moves.map((move, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${move}` : move)).join(" ");

const SPECS: Spec[] = [
  {
    game:
      "1. e4 {The king's pawn. It claims the centre and opens lines for the queen and the bishop.} 1... e5 " +
      "(1... c5 {The Sicilian Defence, a sharper reply.} 2. Nf3) 2. Nf3 Nc6 3. Bb5 {The Ruy Lopez.}",
    ply: 0,
    answer: "e4",
    alsoAccept: "d4",
    kind: "move",
    prompt: "White to move. Play a good first move.",
    hint: "Take some space in the centre.",
    explanation:
      "Every card is a position and a question. You play the move you think is right, then the back shows the " +
      "answer, a few words on why, and the moves that follow. Click any move there to jump the board to it. " +
      "Moves in brackets are other ideas, shown as variations. This card accepts both e4 and d4, because a card " +
      "can store more than one correct answer.",
    notes: "Part of the Famous moves deck. You can edit or delete any card in it.",
    category: "opening",
  },
  {
    game:
      "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5! {Ignores the pin on the knight.} 5... Bxd1 " +
      "(5... dxe5 6. Qxg4 {The queen takes the bishop that was pinning the knight.}) " +
      "6. Bxf7+ Ke7 7. Nd5# {Mate. The king is shut in by its own pieces.}",
    ply: 8,
    answer: "Nxe5",
    kind: "move",
    prompt: "White to move. Black's bishop on g4 pins your knight on f3 to the queen. Find the surprise.",
    hint: "Don't move the queen. Take something on e5.",
    explanation:
      "5. Nxe5! If Black takes the queen, 5... Bxd1 6. Bxf7+ Ke7 7. Nd5# is checkmate: the king is shut in by " +
      "its own pieces and the knights cover the rest. If Black takes the knight, 5... dxe5 6. Qxg4 wins the bishop.",
    notes: "Légal's Mate, named after Sire de Légal, a French player of the 1700s.",
    category: "tactic",
  },
  {
    game: numbered(IMMORTAL_GAME),
    ply: 34,
    answer: "Bd6",
    kind: "move",
    prompt: "White to move. Both your rooks are attacked. Find the quiet move.",
    hint: "It isn't a capture and it isn't check. Look at the dark squares around the black king.",
    explanation:
      "18. Bd6! The bishop takes the dark squares around the black king and keeps the attack going while both " +
      "rooks hang. It ends 18... Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#, after White " +
      "has given up both rooks and the queen.",
    notes: "The Immortal Game. Adolf Anderssen v Lionel Kieseritzky, London, 1851.",
    category: "tactic",
  },
  {
    game:
      "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 " +
      "10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 " +
      "18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+! {The first sacrifice.} 20... Nxe7 21. Qxd7+! {The second: the queen.} " +
      "21... Kxd7 22. Bf5+ {Double check, from the bishop and from the rook behind it.} 22... Ke8 23. Bd7+ Kf8 24. Bxe7#",
    ply: 38,
    answer: "Rxe7+",
    kind: "line",
    lineLength: 9,
    prompt: "White to move. Two sacrifices lead to mate. Find the first, then play on.",
    hint: "A rook takes on e7 with check. Black has to recapture.",
    explanation:
      "20. Rxe7+! Nxe7 21. Qxd7+! Kxd7 22. Bf5+ is a double check, from the bishop and from the rook behind it. " +
      "After 22... Ke8 23. Bd7+ Kf8 24. Bxe7# the bishops finish the job, with White a rook and the queen down.",
    notes: "The Evergreen Game. Adolf Anderssen v Jean Dufresne, Berlin, 1852.",
    category: "tactic",
  },
  {
    game: numbered(OPERA_GAME),
    ply: 30,
    answer: "Qb8+",
    kind: "line",
    lineLength: 3,
    prompt: "White to move. A queen sacrifice forces mate in two. Find it.",
    hint: "Give up the queen on b8 to drag the knight away from d7.",
    explanation:
      "16. Qb8+! Nxb8 17. Rd8#. The sacrifice pulls the knight away from d7, and the rook mates with the bishop " +
      "on g5 guarding d8.",
    notes: "The Opera Game. Paul Morphy v Duke of Brunswick and Count Isouard, Paris, 1858.",
    category: "tactic",
  },
  {
    game:
      "1. f4 d5 2. e3 Nf6 3. b3 e6 4. Bb2 Be7 5. Bd3 b6 6. Nc3 Bb7 7. Nf3 Nbd7 8. O-O O-O 9. Ne2 c5 10. Ng3 Qc7 " +
      "11. Ne5 Nxe5 12. Bxe5 Qc6 13. Qe2 a6 14. Nh5 Nxh5 15. Bxh7+! {The first bishop.} 15... Kxh7 16. Qxh5+ Kg8 " +
      "17. Bxg7! {The second.} 17... Kxg7 18. Qg4+ Kh7 19. Rf3 e5 20. Rh3+ Qh6 21. Rxh6+ Kxh6 " +
      "22. Qd7 {Attacks both black bishops.}",
    ply: 28,
    answer: "Bxh7+",
    kind: "move",
    prompt: "White to move. Black's king looks safe behind its pawns. Break in on h7.",
    hint: "The bishop takes on h7 with check. There is more to come on g7.",
    explanation:
      "15. Bxh7+! Kxh7 16. Qxh5+ Kg8 17. Bxg7! Kxg7 18. Qg4+ Kh7 19. Rf3 brings a rook across to h3. The two " +
      "bishops strip away the king's cover, then the queen and rook finish the job, and 22. Qd7 attacks both " +
      "black bishops. It is the classic double bishop sacrifice.",
    notes: "Emanuel Lasker v Johannes Bauer, Amsterdam, 1889.",
    category: "tactic",
  },
  {
    game:
      "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4 " +
      "9. Qd8+!! {The queen sacrifice.} 9... Kxd8 10. Bg5+ Kc7 (10... Ke8 11. Rd8#) 11. Bd8# {Mate.}",
    ply: 16,
    answer: "Qd8+",
    kind: "move",
    prompt: "White to move. Sacrifice the queen: it ends in mate.",
    hint: "Look down the d-file.",
    explanation:
      "9. Qd8+! Kxd8 10. Bg5+ drags the king out. After 10... Kc7, 11. Bd8# is mate, and 10... Ke8 loses to " +
      "11. Rd8#. The rook on d1 and the bishop do the work.",
    notes: "Richard Réti v Savielly Tartakower, Vienna, 1910.",
    category: "tactic",
  },
  {
    game:
      "1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 " +
      "11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6!! " +
      "{Offers the queen. If it is taken, ...Bxc4+ starts a forced attack.} 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ " +
      "21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 " +
      "29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ " +
      "37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2#",
    ply: 33,
    answer: "Be6",
    showPlies: 17,
    kind: "move",
    prompt: "Black to move. Your queen is attacked. Find the quiet move that ignores it.",
    hint: "Attack the bishop on c4. Capturing it would come with check.",
    explanation:
      "17... Be6!! offers the queen. After 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ the knight keeps checking, " +
      "and Black ends up with a rook, two bishops and a pawn for the queen, and a winning attack.",
    notes: "Donald Byrne v Robert Fischer, New York, 1956, known as the Game of the Century. Fischer was 13.",
    category: "tactic",
  },
  {
    game:
      "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Ng5 Ngf6 6. Bd3 e6 7. N1f3 h6 " +
      "8. Nxe6! {Rips open the cover around the king.} 8... Qe7 9. O-O fxe6 10. Bg6+ Kd8 " +
      "11. Bf4 {The king is stranded in the middle.} 11... b5 12. a4 Bb7 13. Re1 Nd5 14. Bg3 Kc8 15. axb5 cxb5 " +
      "16. Qd3 Bc6 17. Bf5 exf5 18. Rxe7 Bxe7 19. c4",
    ply: 14,
    answer: "Nxe6",
    kind: "move",
    prompt: "White to move. Black has just played h6, asking your knight on g5 what it is doing. Find the sacrifice.",
    hint: "Take the pawn on e6 and let the king's cover fall apart.",
    explanation:
      "8. Nxe6! Qe7 9. O-O fxe6 10. Bg6+ Kd8 11. Bf4 leaves Black's king stranded in the middle. Deep Blue won " +
      "this game, the last of the 1997 match, and Kasparov resigned after 19. c4.",
    notes: "Deep Blue v Garry Kasparov, New York, 1997 (game 6 of the match).",
    category: "tactic",
  },
  {
    game:
      "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 " +
      "11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 " +
      "19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4!! {A rook sacrifice to pull the " +
      "black king into the open.} 24... cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 {Black's king is hunted " +
      "across the board.} 28... Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 " +
      "35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 " +
      "43. Kc1 Rd2 44. Qa7",
    ply: 46,
    answer: "Rxd4",
    showPlies: 9,
    kind: "move",
    prompt: "White to move. Material is level. Find the rook sacrifice.",
    hint: "Take on d4 with the rook. The king on a7 is about to be pulled into the open.",
    explanation:
      "24. Rxd4!! cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 and the black king is hunted across the " +
      "board. Kasparov's attack in this game is often ranked among the finest ever played.",
    notes: "Garry Kasparov v Veselin Topalov, Wijk aan Zee, 1999.",
    category: "tactic",
  },
];

// Oldest game first, after the welcome card.
const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function buildCard(spec: Spec): CardDraft {
  const parsed = parseMovetext(spec.game, START_FEN);
  if (!parsed.ok) throw new Error(`Tutorial deck: ${parsed.error}`);
  const tree: LineTree = parsed.tree;
  const line = mainlineFrom(tree, tree.rootId);
  const answerId = line[spec.ply];
  const found = answerId ? tree.nodes[answerId].san?.replace(/[+#]+$/, "") : undefined;
  if (found !== spec.answer.replace(/[+#]+$/, "")) {
    throw new Error(`Tutorial deck: expected ${spec.answer} at ply ${spec.ply}, found ${found}`);
  }
  const positionId = spec.ply === 0 ? tree.rootId : line[spec.ply - 1];
  const made = draftFromPosition(tree, positionId, {
    kind: spec.kind,
    plies: spec.lineLength,
    category: spec.category,
  });
  if (!made.ok) throw new Error(`Tutorial deck: ${made.error}`);
  const { draft } = made;

  let alternatives = draft.alternatives;
  if (spec.alsoAccept) {
    const parsedAlternatives = parseAlternatives(draft.fen, spec.alsoAccept, draft.answer);
    if (!parsedAlternatives.ok) throw new Error(`Tutorial deck: ${parsedAlternatives.error}`);
    alternatives = parsedAlternatives.moves;
  }

  return {
    ...draft,
    prompt: spec.prompt,
    hint: spec.hint,
    explanation: spec.explanation,
    notes: spec.notes,
    alternatives,
    tags: ["famous moves"],
    continuation: serializeFrom(tree, positionId, spec.showPlies ? { maxPlies: spec.showPlies } : {}),
  };
}

/** The starter deck: one card for each famous move, read from the real games. */
export function buildTutorialCards(): CardDraft[] {
  return ORDER.map((index) => buildCard(SPECS[index]));
}

/** For tests: the label of each card's answer, such as "5. Nxe5". */
export function tutorialAnswerLabels(): string[] {
  return ORDER.map((index) => {
    const spec = SPECS[index];
    const parsed = parseMovetext(spec.game, START_FEN);
    if (!parsed.ok) throw new Error(parsed.error);
    return moveLabel(parsed.tree, mainlineFrom(parsed.tree, parsed.tree.rootId)[spec.ply]);
  });
}
