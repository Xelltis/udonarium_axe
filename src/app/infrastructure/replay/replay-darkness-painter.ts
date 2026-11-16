import { clamp, clamp01 } from '@axe/core/util/clamp';
import type { OverlayPlan, OverlayShape } from '@axe/domain/tabletop/vision-scene';
import type { ReplayFrameCanvas } from '@axe/infrastructure/replay/replay-canvas';

/**
 * Lays darkness and light over the board in a video.
 *
 * A live table builds the same picture from CSS gradients and `clip-path`. A canvas has no
 * cut-out, so the shroud is painted on its own surface, carved away in the shape of each light, and composited.
 */

/** What of a 2D canvas the darkness is painted with: a frame's canvas, or the shroud's own surface. */
export type DarknessCanvas = Pick<
  ReplayFrameCanvas,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'clip'
  | 'fill'
  | 'fillRect'
  | 'translate'
  | 'rotate'
  | 'arc'
  | 'createRadialGradient'
  | 'drawImage'
  | 'fillStyle'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'canvas'
>;

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
export type LayerFactory = (width: number, height: number) => DarknessCanvas | null;

/**
 * Longest side of the shroud surface. Table coordinates would ask for 6000px square, so it is
 * capped here and stretched when drawn — darkness has soft edges, so the coarseness does not show.
 */
export const DARKNESS_LAYER_MAX = 2048;

/**
 * The surface the shroud of each frame of a video is painted on, kept the length of the export.
 *
 * A video draws thirty frames a second. Allocating and discarding a 2048-square surface per frame
 * churns 16MB for the length of the export, so a surface of the same size is washed and reused,
 * and let go of with whatever drew the video.
 */
export class DarknessLayer {
  private scratch: { canvas: OffscreenCanvas; context: DarknessCanvas } | null = null;

  /**
   * A blank surface of the given size to paint the shroud on, only good until the next call. Falls
   * back to a page canvas, and gives null for a size under one pixel or where nothing can be drawn.
   */
  layerOf(width: number, height: number): DarknessCanvas | null {
    if (width < 1 || height < 1) return null;
    if (typeof OffscreenCanvas === 'undefined') return domDarknessLayer(width, height);
    if (!this.scratch || this.scratch.canvas.width !== width || this.scratch.canvas.height !== height) {
      this.dispose();
      const canvas = new OffscreenCanvas(width, height);
      const created = canvas.getContext('2d');
      if (!canDraw(created)) return domDarknessLayer(width, height);
      this.scratch = { canvas, context: created };
    } else {
      // Re-assigning the size would clear it; at the same size, clear it explicitly.
      const reused = this.scratch.canvas.getContext('2d');
      reused?.clearRect(0, 0, width, height);
    }
    const context = this.scratch.context;
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    return context;
  }

  /** Lets go of the surface, which is made again at the next call. */
  dispose(): void {
    if (!this.scratch) return;
    this.scratch.canvas.width = 0;
    this.scratch.canvas.height = 0;
    this.scratch = null;
  }
}

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
 * A blank surface of the given size to paint the shroud on, made for this one call: a frame drawn on
 * its own. The frames of a video are painted on a {@link DarknessLayer} kept for the export instead.
 */
export function defaultDarknessLayer(width: number, height: number): DarknessCanvas | null {
  return new DarknessLayer().layerOf(width, height);
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
  ctx.drawImage(layer.canvas, place.left, place.top, width, height);

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
  const edge = dim > 0 ? clamp(bright / dim, 0, 0.999) : 0;
  gradient.addColorStop(0, color);
  if (edge > 0) gradient.addColorStop(edge, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  target.globalAlpha = clamp01(strength);
  target.fillStyle = gradient;

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
