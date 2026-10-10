import { ParticleShape } from '@axe/domain/effect/effect-particles';
import { withAlpha } from '@axe/domain/effect/particles/shared';

export { withAlpha };

/**
 * Bakes a soft particle for each colour and keeps it.
 *
 * A gradient per particle is expensive, and a hard edge gives no depth however many are
 * laid over each other. A circle white at the centre and falling off to the rim is made once and scaled up.
 */

const TEXTURE_SIZE = 128;
const cache = new Map<ParticleShape, Map<string, HTMLCanvasElement>>();

function shelfFor(shape: ParticleShape): Map<string, HTMLCanvasElement> {
  let shelf = cache.get(shape);
  if (!shelf) {
    shelf = new Map<string, HTMLCanvasElement>();
    cache.set(shape, shelf);
  }
  return shelf;
}

/**
 * The sprite for a particle shape in a colour, baked on first request and kept for the life of the
 * page.
 *
 * Chunks are a lit polygon, smoke is a soft coreless disc, and every other shape is a disc with a
 * white-hot centre. Returns null where there is no document to make a canvas in.
 */
export function particleTexture(shape: ParticleShape, color: string): HTMLCanvasElement | null {
  const shelf = shelfFor(shape);
  const cached = shelf.get(color);
  if (cached) return cached;

  const canvas = createCanvas(TEXTURE_SIZE, TEXTURE_SIZE);
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;

  const half = TEXTURE_SIZE / 2;

  if (shape === 'chunk') {
    drawChunk(context, TEXTURE_SIZE, color);
    shelf.set(color, canvas);
    return canvas;
  }

  const gradient = context.createRadialGradient(half, half, 0, half, half, half);

  if (shape === 'smoke') {
    // Smoke has no core: wide, thin and soft at the edge.
    gradient.addColorStop(0, withAlpha(color, 0.85));
    gradient.addColorStop(0.45, withAlpha(color, 0.4));
    gradient.addColorStop(1, withAlpha(color, 0));
  } else {
    gradient.addColorStop(0, withAlpha('#ffffff', 1));
    gradient.addColorStop(0.18, withAlpha(color, 0.95));
    gradient.addColorStop(0.5, withAlpha(color, 0.35));
    gradient.addColorStop(1, withAlpha(color, 0));
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  shelf.set(color, canvas);
  return canvas;
}

/** Broken rock, filled as a polygon rather than softened, so it keeps an outline. */
function drawChunk(context: CanvasRenderingContext2D, size: number, color: string): void {
  const points = [
    [0.5, 0.06],
    [0.86, 0.3],
    [0.94, 0.66],
    [0.62, 0.95],
    [0.24, 0.88],
    [0.06, 0.5],
    [0.2, 0.18],
  ];

  context.beginPath();
  points.forEach(([x, y], index) => {
    const pointX = x * size;
    const pointY = y * size;
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  });
  context.closePath();
  context.fillStyle = color;
  context.fill();

  // Only the top face is lit, which gives it body.
  context.beginPath();
  context.moveTo(0.5 * size, 0.06 * size);
  context.lineTo(0.86 * size, 0.3 * size);
  context.lineTo(0.55 * size, 0.46 * size);
  context.lineTo(0.2 * size, 0.18 * size);
  context.closePath();
  context.fillStyle = withAlpha('#ffffff', 0.24);
  context.fill();
}

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
