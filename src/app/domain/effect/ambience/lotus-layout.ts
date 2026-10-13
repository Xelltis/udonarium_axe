import { seededRandom } from '@axe/domain/effect/particles/shared';

/** How many pixels a side of the floating-leaf tile is drawn at. */
export const LOTUS_TILE_PX = 256;

/** The most leaves one tile holds, at the top of the scale. */
const MOST_PADS = 24;
/** How many places are tried for each leaf before it is left out. */
const TRIES = 40;

/** One leaf floating on the water, in the tile's own pixels. */
export interface LotusPad {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Which way the cleft in the leaf points, in radians. */
  readonly cleft: number;
  /** What grows from it: a flower open on the leaf, a bud beside it, or nothing. */
  readonly bloom: 'flower' | 'bud' | null;
}

/**
 * Where the leaves lie on one tile, for so much of the water covered from 0 to 1.
 *
 * Leaves of many sizes are scattered so that they touch and overlap a little, as leaves crowd
 * on a pond, but never lie one over another; every distance is taken the short way round the
 * tile, so the tile repeats without a seam. A few carry a flower, a few more a bud. The same
 * seed and amount always lay the same leaves, and more of the scale only adds leaves to those
 * a smaller amount lays.
 */
export function lotusPadsOf(seed: number, amount: number, size = LOTUS_TILE_PX): LotusPad[] {
  const wanted = Math.round(MOST_PADS * Math.min(Math.max(Number.isFinite(amount) ? amount : 0, 0), 1));
  const random = seededRandom(seed);
  const pads: LotusPad[] = [];
  for (let index = 0; index < MOST_PADS && pads.length < wanted; index++) {
    const radius = size * (0.055 + random() * 0.075);
    const cleft = random() * Math.PI * 2;
    const roll = random();
    const bloom = roll < 0.16 ? 'flower' : roll < 0.28 ? 'bud' : null;
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const x = random() * size;
      const y = random() * size;
      const crowded = pads.some((pad) => wrappedDistance(pad.x - x, pad.y - y, size) < (pad.radius + radius) * 0.82);
      if (crowded) continue;
      pads.push({ x, y, radius, cleft, bloom });
      break;
    }
  }
  return pads;
}

function wrappedDistance(dx: number, dy: number, size: number): number {
  const wrap = (delta: number) => {
    const remainder = ((delta % size) + size) % size;
    return remainder > size / 2 ? remainder - size : remainder;
  };
  return Math.hypot(wrap(dx), wrap(dy));
}
