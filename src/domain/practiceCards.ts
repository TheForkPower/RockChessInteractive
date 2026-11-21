import { buildCard, type PracticeCard } from "./practice";

/** Paul Morphy v Duke of Brunswick and Count Isouard, Paris, 1858 (the Opera Game). */
export const OPERA_GAME = (
  "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 " +
  "O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#"
).split(" ");

/** Adolf Anderssen v Lionel Kieseritzky, London, 1851 (the Immortal Game). */
export const IMMORTAL_GAME = (
  "e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 " +
  "h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#"
).split(" ");

export const practiceCards: PracticeCard[] = [
  buildCard({
    id: "opera-mate",
    title: "Mate in one",
    source: "Opera Game, Morphy v Duke of Brunswick and Count Isouard, 1858",
    instruction: "White to play. Deliver checkmate.",
    hint: "A rook move, with a bishop standing behind it.",
    explanation:
      "17. Rd8#. The bishop on g5 guards d8, so the king can't take the rook, and the knight on d7 is gone.",
    game: OPERA_GAME,
    startPly: 32,
    endPly: 33,
    anyMateOnFinalMove: true,
  }),
  buildCard({
    id: "opera-queen-sacrifice",
    title: "Find the sacrifice",
    source: "Opera Game, Morphy v Duke of Brunswick and Count Isouard, 1858",
    instruction: "White to play. Find the move Morphy played.",
    hint: "Give up the queen on b8 to drag away the only piece that can cover d8.",
    explanation:
      "16. Qb8+! Nxb8 17. Rd8#. The queen sacrifice pulls the knight away from d7, and the rook mates one move later.",
    game: OPERA_GAME,
    startPly: 30,
    endPly: 32,
  }),
  buildCard({
    id: "immortal-quiet-move",
    title: "Find the quiet move",
    source: "Immortal Game, Anderssen v Kieseritzky, 1851",
    instruction: "White to play. Find the move Anderssen played.",
    hint: "It isn't a capture and it isn't check. Look at the dark squares around the black king.",
    explanation:
      "18. Bd6! Both white rooks are still attacked, but the bishop takes the dark squares around the black king and keeps the attack going.",
    game: IMMORTAL_GAME,
    startPly: 34,
    endPly: 35,
  }),
  buildCard({
    id: "immortal-finish",
    title: "Play the finish",
    source: "Immortal Game, Anderssen v Kieseritzky, 1851",
    instruction: "White to play. Play the moves that lead to mate.",
    hint: "Start with a check from the knight. Black's replies are forced.",
    explanation:
      "21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#. White gives up the queen, and the king on d8 is mated by the bishop.",
    game: IMMORTAL_GAME,
    startPly: 40,
    endPly: 45,
    anyMateOnFinalMove: true,
  }),
];
