import { CellGrid, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { OverlayPlan, OverlayShape, OverlayVision, ShadowShape } from '@axe/domain/tabletop/vision-scene';
import { fogPattern } from '@axe/features/tabletop/table-vision-overlay/fog-texture';

const TWO_PI = Math.PI * 2;

export interface OverlaySurface {
  originX: number;
  originY: number;
  cells?: { x: number; y: number }[][];
}

interface ResolvedSurface extends OverlaySurface {
  widthPx: number;
  heightPx: number;
}

/**
 * A CSS `rgba()` colour from a hex colour of three or six digits, with or without the `#`; anything
 * unreadable gives white at the same alpha.
 */
export function hexToRgba(color: string, alpha: number): string {
  let hex = color.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
  if (hex.length < 6) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * How brightly an animated light glows at a moment, as a multiplier: a pulse swells slowly between
 * about half and full, a flicker jitters between 0.6 and full, and anything else stays at 1.
 */
export function animationIntensity(animation: string | undefined, timeMs: number): number {
  switch (animation) {
    case 'pulse':
      return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(timeMs / 350));
    case 'flicker':
      return 0.6 + 0.4 * Math.abs(Math.sin(timeMs * 0.013) * Math.sin(timeMs * 0.027 + 1.3));
    default:
      return 1;
  }
}

function glowColor(shape: OverlayShape, alpha: number, timeMs: number): string {
  if (shape.animation === 'neon') {
    const hue = (timeMs * 0.06) % 360;
    return `hsla(${hue.toFixed(0)}, 100%, 60%, ${alpha})`;
  }
  return hexToRgba(shape.color, alpha);
}

function beginClips(ctx: CanvasRenderingContext2D, shape: OverlayShape): boolean {
  const polygon = shape.clipPolygon;
  const hasPolygon = !!polygon && polygon.length >= 3;
  const hasCone = shape.angle < 360;
  if (!hasPolygon && !hasCone) return false;
  ctx.save();
  if (hasPolygon && polygon) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
    ctx.closePath();
    ctx.clip();
  }
  if (hasCone) {
    const half = (shape.angle * Math.PI) / 360;
    const direction = (shape.direction * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(shape.x, shape.y);
    ctx.arc(shape.x, shape.y, Math.max(shape.dimPx, 1), direction - half, direction + half);
    ctx.closePath();
    ctx.clip();
  }
  return true;
}

function carveReveal(ctx: CanvasRenderingContext2D, shape: OverlayShape): void {
  const radius = Math.max(shape.dimPx, 1);
  const coned = beginClips(ctx, shape);
  if (shape.full) {
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  } else {
    const gradient = ctx.createRadialGradient(shape.x, shape.y, 0, shape.x, shape.y, radius);
    const brightStop = shape.dimPx > 0 ? Math.min(shape.brightPx / shape.dimPx, 1) : 1;
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(brightStop, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
  }
  ctx.beginPath();
  ctx.arc(shape.x, shape.y, radius, 0, TWO_PI);
  ctx.fill();
  if (coned) ctx.restore();
}

/**
 * The polygons of a set of cells as one path, traced once for the set.
 *
 * The board's surface cells stay the same for as long as the board does, and a plan's lit cells for
 * as long as the plan, while the darkness is laid down again on every draw.
 */
const polygonPaths = new WeakMap<object, Path2D>();

function tracePolygons(sink: PathSink, polygons: { x: number; y: number }[][]): void {
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    sink.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) sink.lineTo(polygon[i].x, polygon[i].y);
    sink.closePath();
  }
}

function fillPolygons(ctx: CanvasRenderingContext2D, polygons: { x: number; y: number }[][]): void {
  if (typeof Path2D !== 'function') {
    ctx.beginPath();
    tracePolygons(ctx, polygons);
    ctx.fill();
    return;
  }
  let path = polygonPaths.get(polygons);
  if (!path) {
    path = new Path2D();
    tracePolygons(path, polygons);
    polygonPaths.set(polygons, path);
  }
  ctx.fill(path);
}

function carveCells(ctx: CanvasRenderingContext2D, cells: { x: number; y: number }[][]): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  fillPolygons(ctx, cells);
}

function fillSurface(ctx: CanvasRenderingContext2D, surface: ResolvedSurface): void {
  if (surface.cells && surface.cells.length > 0) {
    fillPolygons(ctx, surface.cells);
    return;
  }
  ctx.fillRect(surface.originX, surface.originY, surface.widthPx, surface.heightPx);
}

function drawGlow(ctx: CanvasRenderingContext2D, shape: OverlayShape, timeMs: number): void {
  if (shape.dimPx <= 0) return;
  const coned = beginClips(ctx, shape);
  const intensity = animationIntensity(shape.animation, timeMs);
  const gradient = ctx.createRadialGradient(shape.x, shape.y, 0, shape.x, shape.y, shape.dimPx);
  const brightStop = Math.min(shape.brightPx / shape.dimPx, 1);
  gradient.addColorStop(0, glowColor(shape, 0.35 * intensity, timeMs));
  gradient.addColorStop(brightStop, glowColor(shape, 0.18 * intensity, timeMs));
  gradient.addColorStop(1, glowColor(shape, 0, timeMs));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(shape.x, shape.y, shape.dimPx, 0, TWO_PI);
  ctx.fill();
  if (coned) ctx.restore();
}

function clipToPolygon(ctx: CanvasRenderingContext2D, clip: { x: number; y: number }[] | undefined): boolean {
  if (!clip || clip.length < 3) return false;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(clip[0].x, clip[0].y);
  for (let i = 1; i < clip.length; i++) ctx.lineTo(clip[i].x, clip[i].y);
  ctx.closePath();
  ctx.clip();
  return true;
}

function drawShadow(ctx: CanvasRenderingContext2D, shadow: ShadowShape): void {
  if (shadow.points.length < 3) return;
  const clipped = clipToPolygon(ctx, shadow.clipPolygon);
  const gradient = ctx.createLinearGradient(shadow.x, shadow.y, shadow.fx, shadow.fy);
  gradient.addColorStop(0, hexToRgba(shadow.color, 0.6));
  gradient.addColorStop(1, hexToRgba(shadow.color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(shadow.points[0].x, shadow.points[0].y);
  for (let i = 1; i < shadow.points.length; i++) ctx.lineTo(shadow.points[i].x, shadow.points[i].y);
  ctx.closePath();
  ctx.fill();
  if (clipped) ctx.restore();
}

const SHADOW_BLUR_PX = 3;
const SHADOW_FILTER = `brightness(0) blur(${SHADOW_BLUR_PX}px)`;
/** The steps between baking scales. Finer steps bake more often, coarser ones drift from the softness the edge should have. */
const BAKE_SCALE_STEP = 1.5;

/**
 * The black silhouette a shadow is cast from.
 *
 * There is one for every light against every obstacle, and softening them all each
 * frame rasterises that many times, stretching a pass into hundreds of milliseconds. Each picture is baked once per scale.
 *
 * A baked picture is laid down smaller than it was baked, so the softening is widened
 * to match; a fixed amount would leave the edges of a large picture hard.
 */
interface Silhouette {
  canvas: HTMLCanvasElement;
  pad: number;
}

const silhouettes = new WeakMap<CanvasImageSource, Map<number, Silhouette | null>>();

function silhouetteOf(img: CanvasImageSource, iw: number, ih: number, scale: number): Silhouette | null {
  const step = Math.round(Math.log(Math.max(scale, 1e-3)) / Math.log(BAKE_SCALE_STEP));
  let byScale = silhouettes.get(img);
  if (!byScale) {
    byScale = new Map();
    silhouettes.set(img, byScale);
  }
  // Even a picture that would not bake is remembered, or every shadow would make a canvas and throw it away.
  const cached = byScale.get(step);
  if (cached !== undefined) return cached;

  const bake = (): Silhouette | null => {
    if (typeof document === 'undefined') return null;
    const blur = SHADOW_BLUR_PX / Math.pow(BAKE_SCALE_STEP, step);
    const pad = Math.ceil(blur * 3);
    const canvas = document.createElement('canvas');
    canvas.width = iw + pad * 2;
    canvas.height = ih + pad * 2;
    const baker = canvas.getContext('2d');
    if (!baker || typeof baker.drawImage !== 'function') return null;
    baker.filter = `brightness(0) blur(${blur}px)`;
    baker.drawImage(img, pad, pad);
    return { canvas, pad };
  };

  const baked = bake();
  byScale.set(step, baked);
  return baked;
}

function drawShadowImage(ctx: CanvasRenderingContext2D, shadow: ShadowShape, img: CanvasImageSource): void {
  const ux = shadow.fx - shadow.x;
  const uy = shadow.fy - shadow.y;
  const len = Math.hypot(ux, uy);
  if (len < 1) return;
  const iw = (img as { width?: number }).width || 1;
  const ih = (img as { height?: number }).height || 1;
  const px = -uy / len;
  const py = ux / len;
  const w = shadow.width;
  const baked = silhouetteOf(img, iw, ih, Math.sqrt((w / iw) * (len / ih)));

  ctx.save();
  const clipped = clipToPolygon(ctx, shadow.clipPolygon);
  ctx.globalAlpha = 0.7;
  if (!baked) ctx.filter = SHADOW_FILTER;
  // Laid onto what is already in force rather than in place of it, so the margin the surface
  // is drawn from and the scale it is drawn at both still hold.
  ctx.transform(
    (px * w) / iw,
    (py * w) / iw,
    (shadow.x - shadow.fx) / ih,
    (shadow.y - shadow.fy) / ih,
    shadow.fx - (px * w) / 2,
    shadow.fy - (py * w) / 2
  );
  if (baked) ctx.drawImage(baked.canvas, -baked.pad, -baked.pad);
  else ctx.drawImage(img, 0, 0);
  // The clip is saved separately; restoring only once would leave it on the next picture.
  if (clipped) ctx.restore();
  ctx.restore();
}

/** Whether a light is one of the ones that moves, and so has to be drawn again each pass. */
function isAnimated(shape: OverlayShape): boolean {
  return !!shape.animation && shape.animation !== 'none';
}

/**
 * How many pixels an overlay is allowed to hold, and how far its resolution may be let
 * down to stay inside that.
 *
 * The overlay covers the whole board plus the spill of the widest light, so on a
 * hundred-cell table it comes to six and a half thousand pixels square — forty-three
 * million of them, a hundred and seventy megabytes, and two more surfaces the same size
 * again once a light flickers. Firefox gives up on a canvas long before Chrome does, and
 * a browser that will not hold one in graphics memory draws it by hand instead.
 *
 * What the overlay draws is darkness and soft gradients, which is the one thing that
 * survives being drawn smaller and stretched back up. So a board past the budget is drawn
 * at less than a pixel each and let up to size by the browser, and never at less than
 * half, past which the edges of a hex would start to show it.
 */
export const OVERLAY_PIXEL_BUDGET = 12_000_000;
export const MIN_OVERLAY_SCALE = 0.5;

/**
 * The budget and the floor while the table is drawn the lighter way.
 *
 * The browsers that are drawn that way are the ones that give up on a large canvas first, so
 * the darkness is let down further for them, and the edges of a hex are let soften to pay for it.
 */
export const LIGHT_OVERLAY_PIXEL_BUDGET = 4_000_000;
export const LIGHT_MIN_OVERLAY_SCALE = 0.35;

/**
 * How many canvas pixels an overlay of this size is drawn with, to one pixel of the board.
 *
 * One while it fits inside the budget, and otherwise as much less as keeps it inside, but never
 * less than the floor.
 */
export function overlayScale(
  width: number,
  height: number,
  budget = OVERLAY_PIXEL_BUDGET,
  minScale = MIN_OVERLAY_SCALE
): number {
  const pixels = width * height;
  if (!(pixels > budget)) return 1;
  return Math.max(minScale, Math.sqrt(budget / pixels));
}

export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The ground the lights that move cover, and nothing else, a patch for each group of them.
 *
 * A board is mostly still. Redrawn whole, one candle guttering in a corner would mean clearing
 * the whole board and laying the whole of it down again twenty times a second, which on a large
 * table is tens of millions of pixels a frame for the sake of a few hundred thousand. Kept to the
 * boxes the moving lights actually reach, the rest of the board is left where it is, and two
 * torches at opposite ends of a room redraw their own two corners rather than the room between.
 * Lights whose boxes meet are redrawn in one patch.
 */
export function animatedGlowPatches(
  plan: OverlayPlan,
  widthPx: number,
  heightPx: number,
  margin = 0,
  surface?: OverlaySurface
): DirtyRect[] {
  const resolved = resolvedSurfaceOf(widthPx, heightPx, surface);
  const offsetX = margin - resolved.originX;
  const offsetY = margin - resolved.originY;

  const boxes: Box[] = [];
  for (const shape of plan.glows) {
    if (!isAnimated(shape) || shape.dimPx <= 0) continue;
    boxes.push({
      left: shape.x - shape.dimPx + offsetX,
      top: shape.y - shape.dimPx + offsetY,
      right: shape.x + shape.dimPx + offsetX,
      bottom: shape.y + shape.dimPx + offsetY,
    });
  }

  const width = widthPx + 2 * margin;
  const height = heightPx + 2 * margin;
  const patches: DirtyRect[] = [];
  for (const box of mergeMeeting(boxes)) {
    const x = Math.max(0, Math.floor(box.left));
    const y = Math.max(0, Math.floor(box.top));
    const w = Math.min(width, Math.ceil(box.right)) - x;
    const h = Math.min(height, Math.ceil(box.bottom)) - y;
    if (w > 0 && h > 0) patches.push({ x, y, width: w, height: h });
  }
  return patches;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The boxes with every two that meet taken together, until no two of what is left meet. */
function mergeMeeting(boxes: readonly Box[]): Box[] {
  const merged = boxes.map((box) => ({ ...box }));
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < merged.length && !joined; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i];
        const b = merged[j];
        if (a.left > b.right || b.left > a.right || a.top > b.bottom || b.top > a.bottom) continue;
        merged[i] = {
          left: Math.min(a.left, b.left),
          top: Math.min(a.top, b.top),
          right: Math.max(a.right, b.right),
          bottom: Math.max(a.bottom, b.bottom),
        };
        merged.splice(j, 1);
        joined = true;
        break;
      }
    }
  }
  return merged;
}

/** Whether a light reaches into the patch a pass redraws, which every light does on a pass of the whole board. */
function reachesPatch(shape: OverlayShape, patch: DirtyRect | null, offsetX: number, offsetY: number): boolean {
  if (!patch) return true;
  return (
    shape.x + shape.dimPx + offsetX >= patch.x &&
    shape.x - shape.dimPx + offsetX <= patch.x + patch.width &&
    shape.y + shape.dimPx + offsetY >= patch.y &&
    shape.y - shape.dimPx + offsetY <= patch.y + patch.height
  );
}

/** The baked surfaces, holding what does not change over time. */
export interface OverlayBake {
  /** The darkness, with what can be seen cut out of it, and the lights that stay put. */
  base: BakeCanvas;
  /** The shadows, kept apart from the darkness because they go over the lights. */
  shadows: BakeCanvas | null;
  width: number;
  height: number;
  /** How many canvas pixels went to one overlay pixel when it was drawn. */
  scale: number;
}

export interface BakeCanvas {
  image: CanvasImageSource;
  context: CanvasRenderingContext2D;
}

/** A surface to gather a pass on before it is cut back to what can be seen. */
export function overlayScratch(
  width: number,
  height: number,
  scale: number,
  previous?: BakeCanvas | null
): BakeCanvas | null {
  return bakeCanvas(width, height, scale, previous);
}

function bakeCanvas(width: number, height: number, scale: number, previous?: BakeCanvas | null): BakeCanvas | null {
  if (previous) {
    reset(previous.context, scale);
    previous.context.globalCompositeOperation = 'source-over';
    previous.context.globalAlpha = 1;
    previous.context.clearRect(0, 0, width, height);
    return previous;
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d');
  if (!context || typeof context.drawImage !== 'function') return null;
  reset(context, scale);
  return { image: canvas, context };
}

/**
 * Back to overlay coordinates, whatever the surface is really made of. Everything below
 * works in the pixels of the board rather than the pixels of the canvas, so a canvas drawn
 * smaller than the board it stands for needs saying only here.
 */
function reset(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

/**
 * Bakes the part that does not change over time.
 *
 * A table with a flickering light redraws the same picture over and over, when only the
 * brightness changes. The darkness goes in, and so do the lights that stay put — a lamp
 * that is not guttering has no business being laid down again every pass, and on a board
 * with several of them that is most of the work.
 */
export function bakeOverlayPlan(
  plan: OverlayPlan,
  widthPx: number,
  heightPx: number,
  images?: Map<string, HTMLImageElement>,
  margin = 0,
  surface?: OverlaySurface,
  previous?: OverlayBake | null,
  scale = 1,
  scratch?: BakeCanvas | null
): OverlayBake | null {
  const width = widthPx + 2 * margin;
  const height = heightPx + 2 * margin;
  if (width < 1 || height < 1) return null;

  const reuse =
    previous && previous.width === width && previous.height === height && previous.scale === scale ? previous : null;
  const base = bakeCanvas(width, height, scale, reuse?.base);
  if (!base) return null;

  const resolved = resolvedSurfaceOf(widthPx, heightPx, surface);
  const offsetX = margin - resolved.originX;
  const offsetY = margin - resolved.originY;

  const bounds = { width, height, offsetX, offsetY, scale };
  base.context.translate(offsetX, offsetY);
  paintDarkness(base.context, plan, resolved, scratch ?? null, bounds);

  const glow = (target: CanvasRenderingContext2D): void => {
    target.globalCompositeOperation = 'lighter';
    for (const shape of plan.glows) if (!isAnimated(shape)) drawGlow(target, shape, 0);
    target.globalCompositeOperation = 'source-over';
  };
  if (plan.vision?.clipReveals) {
    throughVision(base.context, plan.vision, scratch ?? null, bounds, 'lighter', glow);
  } else {
    glow(base.context);
  }

  let shadows: BakeCanvas | null = null;
  if (plan.shadows.length > 0) {
    shadows = bakeCanvas(width, height, scale, reuse?.shadows);
    if (shadows) {
      shadows.context.translate(offsetX, offsetY);
      paintShadows(shadows.context, plan, images);
      reset(shadows.context, scale);
    }
  }

  reset(base.context, scale);
  return { base, shadows, width, height, scale };
}

function resolvedSurfaceOf(widthPx: number, heightPx: number, surface?: OverlaySurface): ResolvedSurface {
  return {
    originX: surface?.originX ?? 0,
    originY: surface?.originY ?? 0,
    widthPx,
    heightPx,
    cells: surface?.cells,
  };
}

interface PathSink {
  rect(x: number, y: number, w: number, h: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/**
 * Lays out the cells a mask covers as one path.
 *
 * Compositing counts each drawing separately, so what keeps only the seen part of a pass has
 * to arrive as one drawing; cell by cell, every cell would throw the last one away.
 */
function traceCells(sink: PathSink, grid: CellGrid, keep: (index: number) => boolean): boolean {
  let any = false;
  if (isHexGrid(grid.type)) {
    for (let index = 0; index < grid.cols * grid.rows; index++) {
      if (!keep(index)) continue;
      const points = cellPolygonOf(grid, index);
      sink.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) sink.lineTo(points[i].x, points[i].y);
      sink.closePath();
      any = true;
    }
    return any;
  }
  const size = grid.sizePx;
  for (let row = 0; row < grid.rows; row++) {
    let runFrom = -1;
    for (let col = 0; col <= grid.cols; col++) {
      const inside = col < grid.cols && keep(row * grid.cols + col);
      if (inside) {
        if (runFrom < 0) runFrom = col;
        continue;
      }
      if (runFrom < 0) continue;
      sink.rect(runFrom * size, row * size, (col - runFrom) * size, size);
      any = true;
      runFrom = -1;
    }
  }
  return any;
}

type CellMask = { path: Path2D } | { keep: (index: number) => boolean };

/**
 * The seen cells as a path, worked out once for the scene they belong to.
 *
 * A flickering table lays this down twenty times a second, and walking every cell of a large
 * board that often costs more than the drawing does.
 */
const seenPaths = new WeakMap<OverlayVision, CellMask>();
const unwalkedPaths = new WeakMap<OverlayVision, CellMask>();
const exploredPaths = new WeakMap<OverlayVision, CellMask>();
const rememberedPaths = new WeakMap<OverlayVision, CellMask>();

function cellMaskOf(
  vision: OverlayVision,
  held: WeakMap<OverlayVision, CellMask>,
  keep: (index: number) => boolean
): CellMask {
  const kept = held.get(vision);
  if (kept) return kept;
  let mask: CellMask = { keep };
  if (typeof Path2D === 'function') {
    const path = new Path2D();
    if (traceCells(path, vision.grid, keep)) mask = { path };
  }
  held.set(vision, mask);
  return mask;
}

function seenMask(vision: OverlayVision): CellMask {
  return cellMaskOf(vision, seenPaths, (index) => vision.visible.get(index));
}

function unwalkedMask(vision: OverlayVision): CellMask {
  return cellMaskOf(vision, unwalkedPaths, (index) => !vision.explored.get(index));
}

function exploredMask(vision: OverlayVision): CellMask {
  return cellMaskOf(vision, exploredPaths, (index) => vision.explored.get(index));
}

function rememberedMask(vision: OverlayVision): CellMask {
  return cellMaskOf(vision, rememberedPaths, (index) => vision.explored.get(index) && !vision.visible.get(index));
}

/**
 * Fills the cells nobody has explored yet with the context's current fill, softened by the blur;
 * the outline is traced once per vision and reused.
 */
export function fillUnwalkedCells(ctx: CanvasRenderingContext2D, vision: OverlayVision, blurPx = 0): void {
  fillMask(ctx, vision.grid, unwalkedMask(vision), blurPx);
}

function fillMask(ctx: CanvasRenderingContext2D, grid: CellGrid, mask: CellMask, blurPx: number): void {
  const previous = ctx.filter;
  if (blurPx > 0) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
  if ('path' in mask) {
    ctx.fill(mask.path);
  } else {
    ctx.beginPath();
    if (traceCells(ctx, grid, mask.keep)) ctx.fill();
  }
  if (blurPx > 0) ctx.filter = previous;
}

/**
 * Fills the cells the predicate keeps with the context's current fill, softened by a blur when one
 * is given.
 */
export function fillCells(
  ctx: CanvasRenderingContext2D,
  grid: CellGrid,
  keep: (index: number) => boolean,
  blurPx = 0
): void {
  const previous = ctx.filter;
  if (blurPx > 0) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
  ctx.beginPath();
  if (traceCells(ctx, grid, keep)) ctx.fill();
  if (blurPx > 0) ctx.filter = previous;
}

interface OverlayBounds {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  patch?: DirtyRect | null;
}

/**
 * The seen cells with their edge softened, laid down once for the corner a moving light redraws.
 *
 * Softening the mask with a filter on every pass rasterises the blur twenty times a second, and
 * Firefox does that by hand. The corner is widened by the reach of the blur, so its edge comes
 * out as soft as it would from the whole mask. Only the corner is kept, not the board.
 */
interface SoftMask {
  key: string;
  image: CanvasImageSource | null;
  /** Where the kept corner starts, in canvas pixels. */
  left: number;
  top: number;
}

const softSeenMasks = new WeakMap<OverlayVision, Map<string, SoftMask>>();

function softSeenMaskOf(vision: OverlayVision, mask: CellMask, bounds: OverlayBounds, patch: DirtyRect): SoftMask {
  const scale = bounds.scale;
  const reach = Math.ceil((vision.blurPx * 3) / Math.min(1, scale));
  const left = Math.max(0, Math.floor((patch.x - reach) * scale));
  const top = Math.max(0, Math.floor((patch.y - reach) * scale));
  const right = Math.min(Math.ceil(bounds.width * scale), Math.ceil((patch.x + patch.width + reach) * scale));
  const bottom = Math.min(Math.ceil(bounds.height * scale), Math.ceil((patch.y + patch.height + reach) * scale));
  const key = [left, top, right, bottom, scale, bounds.offsetX, bounds.offsetY, vision.blurPx].join(',');

  let byCorner = softSeenMasks.get(vision);
  if (!byCorner) {
    byCorner = new Map();
    softSeenMasks.set(vision, byCorner);
  }
  const kept = byCorner.get(key);
  if (kept) return kept;

  // Even a corner that would not bake is remembered, or every pass would make a canvas and throw it away.
  const soft: SoftMask = { key, image: null, left, top };
  byCorner.set(key, soft);
  if (!(right > left) || !(bottom > top) || typeof document === 'undefined') return soft;

  const canvas = document.createElement('canvas');
  canvas.width = right - left;
  canvas.height = bottom - top;
  const context = canvas.getContext('2d');
  if (!context || typeof context.drawImage !== 'function') return soft;
  context.setTransform(scale, 0, 0, scale, -left, -top);
  context.translate(bounds.offsetX, bounds.offsetY);
  context.fillStyle = 'rgba(0, 0, 0, 1)';
  fillMask(context, vision.grid, mask, vision.blurPx);
  soft.image = canvas;
  return soft;
}

/**
 * Draws through what the reader can see.
 *
 * With a surface to hand the pass is gathered on it and cut back to the seen cells in one go,
 * which leaves the edge as soft as the blur makes it. Without one the cells become a plain
 * clip, which is the same picture with a harder edge.
 */
function throughVision(
  ctx: CanvasRenderingContext2D,
  vision: OverlayVision,
  scratch: BakeCanvas | null,
  bounds: OverlayBounds,
  composite: GlobalCompositeOperation,
  draw: (target: CanvasRenderingContext2D) => void
): void {
  const mask = seenMask(vision);
  if (!scratch) {
    ctx.save();
    if ('path' in mask) ctx.clip(mask.path);
    else {
      ctx.beginPath();
      if (traceCells(ctx, vision.grid, mask.keep)) ctx.clip();
    }
    draw(ctx);
    ctx.restore();
    return;
  }

  const patch = bounds.patch;
  const target = scratch.context;
  reset(target, bounds.scale);
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
  if (patch) target.clearRect(patch.x, patch.y, patch.width, patch.height);
  else target.clearRect(0, 0, bounds.width, bounds.height);
  target.translate(bounds.offsetX, bounds.offsetY);
  draw(target);
  target.globalCompositeOperation = 'destination-in';
  const soft = patch && vision.blurPx > 0 ? softSeenMaskOf(vision, mask, bounds, patch) : null;
  if (patch && soft?.image) {
    const x = patch.x * bounds.scale;
    const y = patch.y * bounds.scale;
    const width = patch.width * bounds.scale;
    const height = patch.height * bounds.scale;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.drawImage(soft.image, x - soft.left, y - soft.top, width, height, x, y, width, height);
  } else {
    target.fillStyle = 'rgba(0, 0, 0, 1)';
    fillMask(target, vision.grid, mask, vision.blurPx);
  }
  target.globalCompositeOperation = 'source-over';
  reset(target, bounds.scale);

  const previous = ctx.globalCompositeOperation;
  ctx.setTransform(bounds.scale, 0, 0, bounds.scale, 0, 0);
  ctx.globalCompositeOperation = composite;
  blit(ctx, scratch.image, patch ?? null, bounds.width, bounds.height, bounds.scale);
  ctx.globalCompositeOperation = previous;
  reset(ctx, bounds.scale);
  ctx.translate(bounds.offsetX, bounds.offsetY);
}

function paintDarkness(
  ctx: CanvasRenderingContext2D,
  plan: OverlayPlan,
  resolved: ResolvedSurface,
  scratch: BakeCanvas | null,
  bounds: OverlayBounds
): void {
  if (!(plan.darknessAlpha > 0)) {
    paintFog(ctx, plan);
    return;
  }

  ctx.globalAlpha = plan.darknessAlpha;
  ctx.fillStyle = plan.darknessColor;
  fillSurface(ctx, resolved);
  ctx.globalAlpha = 1;

  ctx.globalCompositeOperation = 'destination-out';
  if (plan.baseRevealAlpha > 0) {
    ctx.globalAlpha = plan.baseRevealAlpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    fillSurface(ctx, resolved);
    ctx.globalAlpha = 1;
  }
  const cells = plan.revealCells;
  const carve = (target: CanvasRenderingContext2D): void => {
    if (cells && cells.length > 0) {
      carveCells(target, cells);
    } else {
      for (const shape of plan.reveals) carveReveal(target, shape);
    }
  };
  const vision = plan.vision;
  if (vision?.clipReveals) throughVision(ctx, vision, scratch, bounds, 'destination-out', carve);
  else carve(ctx);
  // Ground the party has taken is lifted out of the dark whether or not a lamp still stands
  // in it, which is the whole of what the easy fog promises.
  if (vision?.clearedStaysLit) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 1;
    fillMask(ctx, vision.grid, exploredMask(vision), vision.blurPx);
  }
  ctx.globalCompositeOperation = 'source-over';

  paintFog(ctx, plan);
}

/**
 * What the party has never been shown, and what it has been shown but cannot see now.
 *
 * The first is laid on solid: it covers the board, the grid and anything drawn flat on them.
 * The second is a veil, so the ground stays readable as a memory of it.
 */
function paintFog(ctx: CanvasRenderingContext2D, plan: OverlayPlan): void {
  const vision = plan.vision;
  if (!vision?.fogEnabled) return;

  ctx.globalCompositeOperation = 'source-over';
  // Cleared ground carries no mist. Only a shade over it, which is what says the fog has
  // gone and nobody is standing there now.
  if (vision.veilAlpha > 0) {
    ctx.fillStyle = vision.veilColor;
    ctx.globalAlpha = vision.veilAlpha;
    fillMask(ctx, vision.grid, rememberedMask(vision), vision.blurPx);
  }
  if (vision.unexploredAlpha > 0) {
    ctx.fillStyle = vision.fogColor;
    ctx.globalAlpha = vision.unexploredAlpha;
    fillMask(ctx, vision.grid, unwalkedMask(vision), vision.blurPx);

    // The mottling that keeps the mist from reading as a sheet of paint. It rides in the
    // surface baked when the scene changes, so it costs nothing on a frame of its own.
    const pattern = fogPattern(ctx);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.globalAlpha = Math.min(1, vision.unexploredAlpha * CLOUD_OVER_UNWALKED);
      fillMask(ctx, vision.grid, unwalkedMask(vision), vision.blurPx);
    }
  }
  ctx.globalAlpha = 1;
}

/** How much of the mottling shows through the mist. */
const CLOUD_OVER_UNWALKED = 0.75;

function paintShadows(
  ctx: CanvasRenderingContext2D,
  plan: OverlayPlan,
  images: Map<string, HTMLImageElement> | undefined
): void {
  ctx.globalCompositeOperation = 'source-over';
  for (const shadow of plan.shadows) {
    const img = shadow.imageUrl && images ? images.get(shadow.imageUrl) : undefined;
    if (img && img.complete && img.naturalWidth > 0) {
      drawShadowImage(ctx, shadow, img);
    } else {
      drawShadow(ctx, shadow);
    }
  }
}

/**
 * Draws one frame of the lighting and vision overlay: the darkness, the glowing lights and the
 * shadows.
 *
 * A bake of the same size and scale supplies what does not change, so over it only the lights that
 * animate are drawn again, and given a dirty rectangle only that part of the canvas is redrawn.
 * Without a usable bake the whole plan is drawn. The margin widens the canvas around the table on
 * every side.
 */
export function drawOverlayPlan(
  ctx: CanvasRenderingContext2D,
  plan: OverlayPlan,
  widthPx: number,
  heightPx: number,
  timeMs = 0,
  images?: Map<string, HTMLImageElement>,
  margin = 0,
  surface?: OverlaySurface,
  bake?: OverlayBake | null,
  dirty?: DirtyRect | null,
  scale = 1,
  scratch?: BakeCanvas | null
): void {
  const resolved = resolvedSurfaceOf(widthPx, heightPx, surface);
  const offsetX = margin - resolved.originX;
  const offsetY = margin - resolved.originY;
  const width = widthPx + 2 * margin;
  const height = heightPx + 2 * margin;

  const usable = bake && bake.width === width && bake.height === height && bake.scale === scale ? bake : null;
  // Only a pass that has the still part already laid down may keep to a corner of the board.
  const patch = usable && dirty ? dirty : null;

  reset(ctx, scale);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (patch) {
    ctx.clearRect(patch.x, patch.y, patch.width, patch.height);
    // A light reaching into the patch from beside it is drawn whole, and nothing past the edge was cleared for it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(patch.x, patch.y, patch.width, patch.height);
    ctx.clip();
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  if (usable) blit(ctx, usable.base.image, patch, width, height, scale);

  const bounds = { width, height, offsetX, offsetY, scale, patch };
  ctx.translate(offsetX, offsetY);
  if (!usable) paintDarkness(ctx, plan, resolved, scratch ?? null, { ...bounds, patch: null });

  // A light that stays put is already in the baked surface, so drawing it again would
  // only add it to itself.
  const glow = (target: CanvasRenderingContext2D): void => {
    target.globalCompositeOperation = 'lighter';
    for (const shape of plan.glows) {
      if ((!usable || isAnimated(shape)) && reachesPatch(shape, patch, offsetX, offsetY))
        drawGlow(target, shape, timeMs);
    }
    target.globalCompositeOperation = 'source-over';
  };
  if (plan.vision?.clipReveals) {
    throughVision(ctx, plan.vision, scratch ?? null, bounds, 'lighter', glow);
  } else {
    glow(ctx);
  }

  ctx.globalCompositeOperation = 'source-over';
  if (usable) {
    if (usable.shadows) {
      reset(ctx, scale);
      blit(ctx, usable.shadows.image, patch, width, height, scale);
    }
  } else {
    paintShadows(ctx, plan, images);
  }

  if (patch) ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  reset(ctx, scale);
}

/**
 * Lays a baked surface down, either whole or only over the part being redrawn.
 *
 * The surface holds canvas pixels and is being laid onto overlay coordinates, so where it
 * is taken from is measured one way and where it lands the other.
 */
function blit(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  patch: DirtyRect | null,
  width: number,
  height: number,
  scale: number
): void {
  if (!patch) {
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }
  ctx.drawImage(
    image,
    patch.x * scale,
    patch.y * scale,
    patch.width * scale,
    patch.height * scale,
    patch.x,
    patch.y,
    patch.width,
    patch.height
  );
}
