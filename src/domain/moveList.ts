/**
 * Formats SAN moves with move numbers, starting from any position:
 * "1. e4 e5 2. Nf3", or "12... Nf6 13. Qb3" when Black moves first.
 */
export function formatMoveList(startFen: string, moves: string[]): string {
  const fields = startFen.trim().split(/\s+/);
  let blackToMove = fields[1] === "b";
  let number = Number.parseInt(fields[5] ?? "1", 10);
  if (!Number.isFinite(number) || number < 1) number = 1;

  const parts: string[] = [];
  moves.forEach((move, index) => {
    if (!blackToMove) {
      parts.push(`${number}.`, move);
    } else {
      if (index === 0) parts.push(`${number}...`);
      parts.push(move);
      number += 1;
    }
    blackToMove = !blackToMove;
  });
  return parts.join(" ");
}
