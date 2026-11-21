// Builds src/assets/pieces/meridian.svg, the sprite the board draws its pieces from.
//
// Usage: node scripts/build-pieces.mjs path/to/chess_svg_piece_sets/meridian
//
// Each source file is a 64x64 Inkscape drawing. The sprite keeps only the
// drawing's paths, scaled to cm-chessboard's 40x40 tiles, one group per piece.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Give the path to the meridian folder.");
  process.exit(1);
}

const PIECES = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"];

/** The <path> elements of a drawing, without Inkscape's bookkeeping attributes. */
function pathsOf(svg) {
  const found = svg.match(/<path\b[^>]*>/gs) ?? [];
  return found.map((tag) =>
    tag
      .replace(/\s(id|sodipodi:[\w-]+|inkscape:[\w-]+)="[^"]*"/g, "")
      .replace(/\s+/g, " ")
      .replace(/ \/>/, "/>"),
  );
}

const groups = PIECES.map((name) => {
  const paths = pathsOf(readFileSync(join(dir, `${name}.svg`), "utf8"));
  if (paths.length === 0) throw new Error(`No paths found in ${name}.svg`);
  return `  <g id="${name}" transform="scale(0.625)">\n    ${paths.join("\n    ")}\n  </g>`;
});

const sprite = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Meridian chess pieces, by Martin Sedlák (2026). The design is copied from a 1952
  German newspaper. Released to the public domain (CC0).
  https://github.com/kmar/chess_svg_piece_sets/tree/main/meridian

  Made into a sprite for cm-chessboard by scripts/build-pieces.mjs: the drawings'
  paths, scaled from 64 to 40 units, one group per piece.
-->
<svg width="40px" height="40px" viewBox="0 0 40 40" version="1.1" xmlns="http://www.w3.org/2000/svg">
${groups.join("\n")}
</svg>
`;

writeFileSync(new URL("../src/assets/pieces/meridian.svg", import.meta.url), sprite);
console.log(`Wrote the sprite: ${PIECES.length} pieces, ${sprite.length} bytes.`);
