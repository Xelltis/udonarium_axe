import { seededRandom } from '@axe/domain/effect/particles/shared';

/** How many pixels a side of the light-net tile is drawn at. */
export const CAUSTIC_TILE_PX = 192;

/** The cells the net is drawn from: how many bright knots there are across one tile. */
const FEATURE_COUNT = 11;
/** How wide a bright line is, against the tile. */
const LINE_WIDTH = 0.032;
/** How far the lines are bent, against the tile; straight they read as a cracked floor. */
const WARP = 0.035;

/**
 * The net of light that water throws on the floor under it, as a field over one tile.
 *
 * Each point of the tile is lit by how near it lies to the line halfway between its two nearest
 * knots, so the lines run between the knots like the meshes of a net. Every distance is taken
 * the short way round the tile, and the bend that takes the straightness off the lines is
 * periodic too, so the tile repeats without a seam.
 */
export interface CausticField {
  readonly size: number;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly phase: readonly number[];
}

/** The field one seed gives. The same seed always gives the same net. */
export function causticFieldOf(seed: number, size = CAUSTIC_TILE_PX): CausticField {
  const random = seededRandom(seed);
  const points = Array.from({ length: FEATURE_COUNT }, () => ({ x: random() * size, y: random() * size }));
  const phase = Array.from({ length: 4 }, () => random() * Math.PI * 2);
  return { size, points, phase };
}

/** How bright the net is at a point, from 0 to 1. */
export function causticAt(field: CausticField, x: number, y: number): number {
  const { size, points, phase } = field;
  const turn = (Math.PI * 2) / size;
  const bentX = x + size * WARP * (Math.sin(y * turn * 2 + phase[0]) + 0.5 * Math.sin(y * turn * 3 + phase[1]));
  const bentY = y + size * WARP * (Math.sin(x * turn * 2 + phase[2]) + 0.5 * Math.sin(x * turn * 3 + phase[3]));

  let nearest = Infinity;
  let second = Infinity;
  for (const point of points) {
    const dx = wrapped(bentX - point.x, size);
    const dy = wrapped(bentY - point.y, size);
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < nearest) {
      second = nearest;
      nearest = distance;
    } else if (distance < second) {
      second = distance;
    }
  }
  const edge = (second - nearest) / (size * LINE_WIDTH);
  const line = Math.max(0, 1 - edge);
  return line * line;
}

/** The net over a whole tile, row by row, as alpha from 0 to 255. */
export function causticAlpha(field: CausticField): Uint8ClampedArray {
  const size = field.size;
  const alpha = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      alpha[y * size + x] = Math.round(causticAt(field, x + 0.5, y + 0.5) * 255);
    }
  }
  return alpha;
}

/** The shortest way across a tile that wraps round, either way. */
function wrapped(delta: number, size: number): number {
  const remainder = ((delta % size) + size) % size;
  return remainder > size / 2 ? remainder - size : remainder;
}
