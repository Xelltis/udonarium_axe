import { LOTUS_TILE_PX, type LotusPad, lotusPadsOf } from '@axe/domain/effect/ambience/lotus-layout';

const SEED = 20261016;
/** How finely the amount of leaves is told apart; one tile is drawn for each step. */
const STEPS = 10;
/** How wide the cleft in a leaf opens, either side of where it points, in radians. */
const CLEFT_HALF = 0.2;
const VEINS = 11;

const tiles = new Map<number, string>();

/**
 * The leaves floating on a pond, as a picture to repeat, for so much of the water covered from 0
 * to 1; empty for none, or where none can be drawn.
 *
 * Drawn in their own colours rather than in the water's: a lotus leaf is green whatever the water
 * under it. One tile is drawn for each tenth of the scale and kept for the life of the page.
 */
export function lotusTileUrl(amount: number): string {
  const step = Math.round(Math.min(Math.max(Number.isFinite(amount) ? amount : 0, 0), 1) * STEPS);
  if (step < 1) return '';
  const held = tiles.get(step);
  if (held !== undefined) return held;
  const url = drawTile(lotusPadsOf(SEED, step / STEPS));
  if (url) tiles.set(step, url);
  return url ?? '';
}

function drawTile(pads: readonly LotusPad[]): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = LOTUS_TILE_PX;
  canvas.height = LOTUS_TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;
  // Every leaf is drawn again a tile away on every side, so one running off an edge comes back on the other.
  const offsets = [-LOTUS_TILE_PX, 0, LOTUS_TILE_PX];
  for (const layer of [drawShadow, drawLeaf, drawBloom]) {
    for (const pad of pads) {
      for (const dx of offsets) {
        for (const dy of offsets) {
          ctx.save();
          ctx.translate(pad.x + dx, pad.y + dy);
          layer(ctx, pad);
          ctx.restore();
        }
      }
    }
  }
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** The shadow a leaf throws on the water just under it, which is what lifts it off the surface. */
function drawShadow(ctx: CanvasRenderingContext2D, pad: LotusPad): void {
  const r = pad.radius;
  const shade = ctx.createRadialGradient(r * 0.15, r * 0.2, r * 0.6, r * 0.15, r * 0.2, r * 1.15);
  shade.addColorStop(0, 'rgba(8, 28, 18, 0.32)');
  shade.addColorStop(1, 'rgba(8, 28, 18, 0)');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(r * 0.15, r * 0.2, r * 1.15, 0, Math.PI * 2);
  ctx.fill();
}

/** A round leaf with a cleft running in to its middle, paler at the middle, its veins running out to the rim. */
function drawLeaf(ctx: CanvasRenderingContext2D, pad: LotusPad): void {
  const r = pad.radius;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, pad.cleft + CLEFT_HALF, pad.cleft - CLEFT_HALF + Math.PI * 2);
  ctx.closePath();
  const fill = ctx.createRadialGradient(-r * 0.15, -r * 0.2, r * 0.1, 0, 0, r);
  fill.addColorStop(0, '#86bd62');
  fill.addColorStop(0.7, '#5a9a42');
  fill.addColorStop(1, '#3d7430');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(38, 78, 30, 0.9)';
  ctx.stroke();

  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(214, 240, 182, 0.35)';
  const open = Math.PI * 2 - CLEFT_HALF * 2;
  for (let vein = 0; vein < VEINS; vein++) {
    const angle = pad.cleft + CLEFT_HALF + (open * (vein + 0.5)) / VEINS;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9);
    ctx.stroke();
  }
}

/** A flower open on the leaf, or a bud standing up beside it. */
function drawBloom(ctx: CanvasRenderingContext2D, pad: LotusPad): void {
  const r = pad.radius;
  if (pad.bloom === 'flower') {
    drawPetals(ctx, 9, r * 0.62, r * 0.24, '#e9779f', '#f8bfd3', pad.cleft);
    drawPetals(ctx, 7, r * 0.42, r * 0.19, '#f39cbc', '#fde4ee', pad.cleft + 0.4);
    ctx.fillStyle = '#f2cf53';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else if (pad.bloom === 'bud') {
    const x = Math.cos(pad.cleft) * r * 1.05;
    const y = Math.sin(pad.cleft) * r * 1.05;
    const bud = ctx.createRadialGradient(x - r * 0.05, y - r * 0.08, 0, x, y, r * 0.26);
    bud.addColorStop(0, '#fbd4e2');
    bud.addColorStop(1, '#e3709a');
    ctx.fillStyle = bud;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.17, r * 0.27, pad.cleft + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A ring of petals reaching out from the middle, darker at the tips and pale at the root. */
function drawPetals(
  ctx: CanvasRenderingContext2D,
  count: number,
  reach: number,
  width: number,
  tip: string,
  root: string,
  turn: number
): void {
  for (let petal = 0; petal < count; petal++) {
    ctx.save();
    ctx.rotate(turn + (Math.PI * 2 * petal) / count);
    const shade = ctx.createLinearGradient(0, 0, reach, 0);
    shade.addColorStop(0, root);
    shade.addColorStop(1, tip);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(reach / 2, 0, reach / 2, width / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
