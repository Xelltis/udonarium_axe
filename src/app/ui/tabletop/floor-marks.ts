import { DestroyRef, effect, inject, untracked } from '@angular/core';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';

/** A point of the board, in table pixels. */
export interface FloorPoint {
  readonly x: number;
  readonly y: number;
}

/** How a mark is outlined: its colour, how wide, the dashes it is broken into, and how opaque. */
export interface FloorStroke {
  readonly colour: string;
  readonly widthPx: number;
  readonly dash?: readonly number[];
  readonly opacity?: number;
  /** Whether its ends and corners are rounded off, as a path is drawn. */
  readonly round?: boolean;
}

/** How a mark is filled: its colour and how opaque. */
export interface FloorFill {
  readonly colour: string;
  readonly opacity?: number;
}

/**
 * A mark drawn on the floor in table pixels: a line through points, closed round into a shape that
 * may be filled; a circle; or words, outlined so that they read on any ground.
 */
export type FloorMark =
  | {
      readonly kind: 'line';
      readonly points: readonly FloorPoint[];
      readonly closed?: boolean;
      readonly fill?: FloorFill;
      readonly stroke?: FloorStroke;
    }
  | {
      readonly kind: 'circle';
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly fill?: FloorFill;
      readonly stroke?: FloorStroke;
    }
  | {
      readonly kind: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly sizePx: number;
      readonly colour: string;
      readonly outline: string;
      readonly outlinePx: number;
    };

/** The marks laid at one height over the ground, which the ground's rise and fall is added to. */
export interface FloorMarkLayer {
  readonly heightPx: number;
  readonly marks: readonly FloorMark[];
}

/**
 * Marks laid at heights of their own gathered into a layer for each height, lowest first, so that as
 * few canvases as there are heights carry them.
 */
export function floorMarkLayersOf(laid: readonly FloorMarkLayer[]): FloorMarkLayer[] {
  const byHeight = new Map<number, FloorMark[]>();
  for (const layer of laid) {
    const marks = byHeight.get(layer.heightPx) ?? [];
    marks.push(...layer.marks);
    byHeight.set(layer.heightPx, marks);
  }
  return [...byHeight].sort(([a], [b]) => a - b).map(([heightPx, marks]) => ({ heightPx, marks }));
}

/** How far round its marks a canvas reaches, in table pixels, for what blurs at their edges. */
const MARGIN_PX = 4;

/** How many pixels a canvas of marks may hold, past which it is drawn smaller. */
const MARK_PIXEL_BUDGET = 4_000_000;

/** How wide words of a size run at most, for each letter, as a share of the size. */
const LETTER_WIDTH = 0.7;

/** The box round a set of marks, in table pixels, with what their outlines and words reach past them, or null for none. */
export function floorMarksBox(
  marks: readonly FloorMark[]
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const take = (x: number, y: number, reach: number) => {
    left = Math.min(left, x - reach);
    top = Math.min(top, y - reach);
    right = Math.max(right, x + reach);
    bottom = Math.max(bottom, y + reach);
  };
  for (const mark of marks) {
    if (mark.kind === 'line') {
      const reach = (mark.stroke?.widthPx ?? 0) / 2;
      for (const point of mark.points) take(point.x, point.y, reach);
    } else if (mark.kind === 'circle') {
      take(mark.x, mark.y, mark.r + (mark.stroke?.widthPx ?? 0) / 2);
    } else {
      const half = (mark.text.length * mark.sizePx * LETTER_WIDTH) / 2 + mark.outlinePx;
      left = Math.min(left, mark.x - half);
      right = Math.max(right, mark.x + half);
      top = Math.min(top, mark.y - mark.sizePx - mark.outlinePx);
      bottom = Math.max(bottom, mark.y + mark.sizePx * 0.3 + mark.outlinePx);
    }
  }
  if (!(right >= left) || !(bottom >= top)) return null;
  return {
    x: left - MARGIN_PX,
    y: top - MARGIN_PX,
    width: right - left + MARGIN_PX * 2,
    height: bottom - top + MARGIN_PX * 2,
  };
}

/**
 * Paints marks on a canvas as large as the box round them, no larger than a canvas is let be, and
 * says on the canvas where that box lies over the board, as the floor reads it; answers whether there
 * was anything to paint.
 */
export function paintFloorMarks(canvas: HTMLCanvasElement, marks: readonly FloorMark[]): boolean {
  const box = floorMarksBox(marks);
  if (!box) return false;
  const scale = Math.min(1, Math.sqrt(MARK_PIXEL_BUDGET / Math.max(1, box.width * box.height)));
  canvas.width = Math.max(1, Math.ceil(box.width * scale));
  canvas.height = Math.max(1, Math.ceil(box.height * scale));
  Object.assign(canvas.style, {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  const context = canvas.getContext('2d');
  if (!context) return true;
  context.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  for (const mark of marks) paintMark(context, mark);
  return true;
}

function paintMark(context: CanvasRenderingContext2D, mark: FloorMark): void {
  if (mark.kind === 'text') {
    context.font = `700 ${mark.sizePx}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.globalAlpha = 1;
    context.lineJoin = 'round';
    context.lineWidth = mark.outlinePx;
    context.strokeStyle = mark.outline;
    context.setLineDash([]);
    context.strokeText(mark.text, mark.x, mark.y);
    context.fillStyle = mark.colour;
    context.fillText(mark.text, mark.x, mark.y);
    return;
  }
  context.beginPath();
  if (mark.kind === 'circle') {
    context.arc(mark.x, mark.y, mark.r, 0, Math.PI * 2);
  } else {
    mark.points.forEach((point, index) =>
      index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)
    );
    if (mark.closed) context.closePath();
  }
  if (mark.fill) {
    context.globalAlpha = mark.fill.opacity ?? 1;
    context.fillStyle = mark.fill.colour;
    context.fill();
  }
  const stroke = mark.stroke;
  if (stroke) {
    context.globalAlpha = stroke.opacity ?? 1;
    context.strokeStyle = stroke.colour;
    context.lineWidth = stroke.widthPx;
    context.lineCap = stroke.round ? 'round' : 'butt';
    context.lineJoin = stroke.round ? 'round' : 'miter';
    context.setLineDash(stroke.dash ? [...stroke.dash] : []);
    context.stroke();
  }
  context.globalAlpha = 1;
}

/**
 * Lays the marks given on the floor of a table drawn on a canvas, a canvas for each height they are
 * laid at, painted again whenever they change and taken up once there are none, or once the caller
 * goes. The floor lays each over the ground, following its rise and fall, so the marks lie on the
 * hills and are hidden behind them as the ground is. Must be called in an injection context.
 */
export function layFloorMarks(id: string, layers: () => readonly FloorMarkLayer[]): void {
  const floors = inject(FloorCanvasesService);
  const canvases: HTMLCanvasElement[] = [];
  let laid = 0;
  const takeUp = (from: number) => {
    for (let index = from; index < laid; index++) floors.forget(`${id}-${index}`);
  };
  effect(() => {
    const drawn = layers().filter((layer) => layer.marks.length > 0);
    untracked(() => {
      let shown = 0;
      for (const layer of drawn) {
        const canvas = (canvases[shown] ??= document.createElement('canvas'));
        if (!paintFloorMarks(canvas, layer.marks)) continue;
        floors.show(`${id}-${shown}`, canvas, layer.heightPx);
        shown++;
      }
      takeUp(shown);
      laid = shown;
    });
  });
  inject(DestroyRef).onDestroy(() => takeUp(0));
}
