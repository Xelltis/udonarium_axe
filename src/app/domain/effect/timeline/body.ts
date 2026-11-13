import {
  blank,
  clamp01,
  easeOutCubic,
  type EffectSprite,
  type Point3,
  takeRandoms,
} from '@axe/domain/effect/timeline/shared';

/*
 * The crumbling of a piece's own picture: cut into a grid and scattered as fragments, laid over the
 * table where the piece is drawn.
 */

const DISSOLVE_COLUMNS = 4;
const DISSOLVE_ROWS = 6;
/** The size of one fragment. The picture of a piece fits one cell. */
const DISSOLVE_PIECE_SCALE = 0.34;
/** How tall the picture that crumbles is drawn, against the size the effect is drawn at. */
export const DISSOLVE_PICTURE_HEIGHT = DISSOLVE_PIECE_SCALE * DISSOLVE_ROWS;

/**
 * The crumbling: the picture itself is cut into a grid and its fragments fly apart from the bottom
 * up, fading as they go. Nothing for a piece with no picture.
 */
export function appendDissolve(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  random: () => number,
  image: string
): void {
  if (image.length < 1) return;
  const life = 1 - clamp01((progress - 0.55) / 0.45);
  const jitters = takeRandoms(random, DISSOLVE_COLUMNS * DISSOLVE_ROWS * 3);
  const piece = base * DISSOLVE_PIECE_SCALE;

  for (let row = 0; row < DISSOLVE_ROWS; row++) {
    for (let column = 0; column < DISSOLVE_COLUMNS; column++) {
      const index = row * DISSOLVE_COLUMNS + column;
      const seed = jitters[index * 3];
      const spin = jitters[index * 3 + 1] - 0.5;
      const lift = jitters[index * 3 + 2];
      // They go from the bottom up with a pause between; all at once it reads as an explosion.
      const born = (1 - row / DISSOLVE_ROWS) * 0.42 + seed * 0.14;
      const local = clamp01((progress - born) / 0.52);
      if (local <= 0) continue;

      const fly = easeOutCubic(local);
      const away = (column / (DISSOLVE_COLUMNS - 1) - 0.5) * 2;
      sprites.push({
        ...blank(),
        key: `${prefix}-dissolve-piece-${index}`,
        x: center.x,
        y: center.y,
        z: center.z + base * 0.9,
        // One cell of the grid is shown and flown as a piece.
        offsetX: away * piece * (0.5 + fly * 2.2) + spin * piece * fly * 1.6,
        offsetY: (row / (DISSOLVE_ROWS - 1) - 0.5) * piece * DISSOLVE_ROWS * 0.5 - piece * fly * (1.6 + lift * 2.4),
        width: piece * DISSOLVE_COLUMNS,
        height: piece * DISSOLVE_ROWS,
        rotate: spin * 90 * fly,
        opacity: life * (1 - local) ** 0.7,
        background: `url(${image}) center/contain no-repeat`,
        clipPath: cellClipPath(column, row),
      });
    }
  }
}

/** The clip that shows one cell of the grid. */
function cellClipPath(column: number, row: number): string {
  const left = (column / DISSOLVE_COLUMNS) * 100;
  const right = 100 - ((column + 1) / DISSOLVE_COLUMNS) * 100;
  const top = (row / DISSOLVE_ROWS) * 100;
  const bottom = 100 - ((row + 1) / DISSOLVE_ROWS) * 100;
  return `inset(${roundedPercent(top)} ${roundedPercent(right)} ${roundedPercent(bottom)} ${roundedPercent(left)})`;
}

/** A share of the picture as a percentage to two places, which keeps the clip written short. */
function roundedPercent(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}
