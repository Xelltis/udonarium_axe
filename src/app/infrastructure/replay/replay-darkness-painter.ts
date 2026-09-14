import type { OverlayPlan, OverlayShape } from '@axe/domain/tabletop/vision-scene';

/**
 * Lays darkness and light over the board in a video.
 *
 * A live table builds the same picture from CSS gradients and `clip-path`. A canvas has no
 * cut-out, so the shroud is painted on its own surface, carved away in the shape of each light, and composited.
 */

export interface DarknessCanvas {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  clip(): void;
  fill(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  arc(x: number, y: number, radius: number, from: number, to: number): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): { addColorStop(offset: number, color: string): void };
  drawImage(image: CanvasImageSource, x: number, y: number, width: number, height: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern | object;
  globalAlpha: number;
  globalCompositeOperation: string;
  canvas: { width: number; height: number };
}

export interface DarknessPlacement {
  /** Top left of the board, in screen coordinates. */
  left: number;
  top: number;
  /** Size of the table, in screen coordinates. */
  width: number;
  height: number;
  /** Converts a table length into a screen length. */
  onBoard(value: number): number;
}

/** Whether a second surface can be made. Where it cannot, the board is drawn without darkness. */
type LayerFactory = (width: number, height: number) => DarknessCanvas | null;

/**
 * Longest side of the shroud surface. Table coordinates would ask for 6000px square, so it is
 * capped here and stretched when drawn — darkness has soft edges, so the coarseness does not show.
 */
export const DARKNESS_LAYER_MAX = 2048;

/**
 * The shroud surface is reused.
 *
 * A video draws thirty frames a second. Allocating and discarding a 2048-square surface per frame
 * churns 16MB for the length of the export, so a surface of the same size is washed and reused.
 */
let scratch: { canvas: OffscreenCanvas; context: DarknessCanvas } | null = null;

/**
 * Whether a context that came back can actually be drawn on.
 *
 * Asking for a two-dimensional context is meant to answer with one or with nothing, but a
 * context can come back that is neither: an object with none of the drawing on it. Taken at
 * face value it fails at the first stroke, a long way from wherever it was handed over.
 */
function canDraw(context: unknown): context is DarknessCanvas {
  const candidate = context as Partial<DarknessCanvas> | null;
  return typeof candidate?.fillRect === 'function' && typeof candidate?.drawImage === 'function';
}

/**
 * A blank surface of the given size to paint the shroud on.
 *
 * One offscreen surface is kept and cleared between calls, so what this returns is only good
 * until the next call. Falls back to a page canvas, and gives null for a size under one pixel
 * or where nothing can be drawn.
 */
export function defaultDarknessLayer(width: number, height: number): DarknessCanvas | null {
  if (width < 1 || height < 1) return null;

  if (typeof OffscreenCanvas !== 'undefined') {
    if (!scratch || scratch.canvas.width !== width || scratch.canvas.height !== height) {
      const canvas = new OffscreenCanvas(width, height);
      const created = canvas.getContext('2d');
      if (!canDraw(created)) {
        scratch = null;
        return domDarknessLayer(width, height);
      }
      scratch = { canvas, context: created };
    } else {
      // Re-assigning the size would clear it; at the same size, clear it explicitly.
      const reused = scratch.canvas.getContext('2d');
      reused?.clearRect(0, 0, width, height);
    }
    const context = scratch.context;
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    return context;
  }
  return domDarknessLayer(width, height);
}

function domDarknessLayer(width: number, height: number): DarknessCanvas | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const created = canvas.getContext('2d');
  return canDraw(created) ? created : null;
}

/**
 * Paints a vision plan's darkness and light over the board in a video frame.
 *
 * The shroud is filled on its own surface, capped at `DARKNESS_LAYER_MAX` on its longest side,
 * then carved away where the plan reveals, stretched over the board, and the lights' colour is
 * added on top. Nothing is drawn when the board has no size or no surface can be made.
 */
export function paintReplayDarkness(
  ctx: DarknessCanvas,
  plan: OverlayPlan,
  place: DarknessPlacement,
  layerOf: LayerFactory = defaultDarknessLayer
): void {
  const width = Math.round(place.width);
  const height = Math.round(place.height);
  if (width < 1 || height < 1) return;

  // Surface detail. It may be coarser than the drawn size, so the longest side caps it.
  const shrink = Math.min(1, DARKNESS_LAYER_MAX / Math.max(width, height));
  const layerWidth = Math.max(1, Math.round(width * shrink));
  const layerHeight = Math.max(1, Math.round(height * shrink));
  const onLayer = (value: number): number => place.onBoard(value) * shrink;

  const layer = layerOf(layerWidth, layerHeight);
  if (!layer) return;

  // 1. The shroud: fill the whole table.
  layer.fillStyle = plan.darknessColor;
  layer.globalAlpha = clamp01(plan.darknessAlpha);
  layer.fillRect(0, 0, layerWidth, layerHeight);
  layer.globalAlpha = 1;

  // 2. Carve out what is seen. The ambient light thins the whole thing from the start.
  layer.globalCompositeOperation = 'destination-out';
  const base = clamp01(plan.baseRevealAlpha);
  if (base > 0) {
    layer.fillStyle = '#000000';
    layer.globalAlpha = base;
    layer.fillRect(0, 0, layerWidth, layerHeight);
    layer.globalAlpha = 1;
  }

  if (plan.revealCells && plan.revealCells.length > 0) {
    // When light snaps to cells, carve cell shapes rather than the light shapes.
    layer.fillStyle = '#000000';
    for (const cell of plan.revealCells) {
      if (cell.length < 3) continue;
      layer.beginPath();
      layer.moveTo(onLayer(cell[0].x), onLayer(cell[0].y));
      for (const point of cell.slice(1)) layer.lineTo(onLayer(point.x), onLayer(point.y));
      layer.closePath();
      layer.fill();
    }
  } else {
    for (const reveal of plan.reveals) eraseShape(layer, reveal, { ...place, onBoard: onLayer });
  }

  layer.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.drawImage(layer.canvas as unknown as CanvasImageSource, place.left, place.top, width, height);

  // 3. The colour of the light, laid thinly over what was carved so it reads as lit.
  ctx.globalCompositeOperation = 'lighter';
  for (const glow of plan.glows) {
    ctx.save();
    clipToPolygon(ctx, glow, place);
    fillShape(ctx, glow, place, place.left, place.top, 0.35);
    ctx.restore();
  }
  ctx.restore();
}

function eraseShape(layer: DarknessCanvas, shape: OverlayShape, place: DarknessPlacement): void {
  layer.save();
  clipToPolygon(layer, shape, place, true);
  fillShape(layer, shape, place, 0, 0, 1, '#000000');
  layer.restore();
}

/** How far a light reaches: strong at the centre, falling away to nothing at `dimPx`. */
function fillShape(
  target: DarknessCanvas,
  shape: OverlayShape,
  place: DarknessPlacement,
  offsetX: number,
  offsetY: number,
  strength: number,
  color = shape.color
): void {
  const x = offsetX + place.onBoard(shape.x);
  const y = offsetY + place.onBoard(shape.y);
  const dim = place.onBoard(Math.max(shape.dimPx, 1));
  const bright = place.onBoard(Math.max(shape.brightPx, 0));

  const gradient = target.createRadialGradient(x, y, 0, x, y, dim);
  const edge = dim > 0 ? Math.min(0.999, Math.max(0, bright / dim)) : 0;
  gradient.addColorStop(0, color);
  if (edge > 0) gradient.addColorStop(edge, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  target.globalAlpha = clamp01(strength);
  target.fillStyle = gradient as unknown as CanvasGradient;

  target.beginPath();
  if (shape.angle >= 360) {
    target.arc(x, y, dim, 0, Math.PI * 2);
  } else {
    // A cone. It faces the same way as on the table and is drawn as a fan seen from above.
    const half = (shape.angle * Math.PI) / 360;
    const facing = (shape.direction * Math.PI) / 180;
    target.moveTo(x, y);
    target.arc(x, y, dim, facing - half, facing + half);
    target.closePath();
  }
  target.fill();
  target.globalAlpha = 1;
}

function clipToPolygon(target: DarknessCanvas, shape: OverlayShape, place: DarknessPlacement, atOrigin = false): void {
  const polygon = shape.clipPolygon;
  if (!polygon || polygon.length < 3) return;

  const offsetX = atOrigin ? 0 : place.left;
  const offsetY = atOrigin ? 0 : place.top;
  target.beginPath();
  target.moveTo(offsetX + place.onBoard(polygon[0].x), offsetY + place.onBoard(polygon[0].y));
  for (const point of polygon.slice(1)) {
    target.lineTo(offsetX + place.onBoard(point.x), offsetY + place.onBoard(point.y));
  }
  target.closePath();
  target.clip();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
