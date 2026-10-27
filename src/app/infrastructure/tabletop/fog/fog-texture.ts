import { seededRandom } from '@axe/domain/effect/particles/shared';

export const FOG_TILE_PX = 256;

const SEED = 20260901;
const BLOB_COUNT = 30;
const MIN_BLOB = 0.14;
const MAX_BLOB = 0.42;
const MAX_BLOB_ALPHA = 0.2;

let tileImage: HTMLCanvasElement | null = null;

/**
 * The mottling that turns a flat wash into weather.
 *
 * Laid in black and white rather than in the colour of the fog, so one tile serves whatever
 * colour a table has set, and drawn once for the life of the page: the fog layer is baked
 * when the scene changes and never on a frame of its own, so the pattern costs nothing to
 * keep. Blobs that run off an edge are drawn again on the opposite one, which is what lets
 * the tile repeat without a seam.
 */
export function fogPatternImage(): HTMLCanvasElement | null {
  if (tileImage !== null) return tileImage;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = FOG_TILE_PX;
  canvas.height = FOG_TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;

  const random = seededRandom(SEED);
  for (let i = 0; i < BLOB_COUNT; i++) {
    const x = random() * FOG_TILE_PX;
    const y = random() * FOG_TILE_PX;
    const radius = (MIN_BLOB + random() * (MAX_BLOB - MIN_BLOB)) * FOG_TILE_PX;
    const alpha = MAX_BLOB_ALPHA * (0.35 + random() * 0.65);
    const paint = random() < 0.55 ? '255, 255, 255' : '0, 0, 0';
    for (const [dx, dy] of WRAPS) {
      const cx = x + dx * FOG_TILE_PX;
      const cy = y + dy * FOG_TILE_PX;
      if (cx + radius < 0 || cy + radius < 0 || cx - radius > FOG_TILE_PX || cy - radius > FOG_TILE_PX) continue;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(${paint}, ${alpha.toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${paint}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
  }

  tileImage = canvas;
  return tileImage;
}

/**
 * A repeating pattern of the fog's mottling tile for the context, or null where the tile or the
 * pattern cannot be made.
 */
export function fogPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const image = fogPatternImage();
  if (!image || typeof ctx.createPattern !== 'function') return null;
  return ctx.createPattern(image, 'repeat');
}

const WRAPS: readonly [number, number][] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
