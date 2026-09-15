import { ShapeGeneratorKind } from '@axe/features/map-editor/model/editor-tool';
import {
  FreehandLayer,
  ImageItem,
  MapScene,
  newId,
  ShapeItem,
  ShapeShadow,
  StrokeDash,
  TextItem,
  TextOutline,
} from '@axe/features/map-editor/model/scene';
import { eraseStrokeAtPoint } from '@axe/features/map-editor/model/scene-ops';
import { generateShapePoints } from '@axe/features/map-editor/model/shape-points';
import { BoardPoint, MarkRef } from '@axe/features/tabletop/white-board/white-board-geometry';

export interface MarkStyle {
  color: string;
  width: number;
  fontSize: number;
  fillColor?: string;
  dash?: StrokeDash;
  shadow?: boolean;
  outline?: string;
  outlineWidth?: number;
  underline?: boolean;
  strike?: boolean;
}

/** The line struck round letters, against the size of the letters themselves. */
export function outlineFor(style: MarkStyle): TextOutline | null {
  const width = style.outlineWidth ?? 0;
  if (width <= 0 || !style.outline) return null;
  return { color: style.outline, width: (style.fontSize * width) / 100 };
}

/** What a shape is dropped onto the sheet with when it is asked to cast a shadow. */
export const MARK_SHADOW: ShapeShadow = { color: 'rgba(0,0,0,0.35)', blur: 8, offsetX: 3, offsetY: 4 };

/** A freehand stroke through a flat list of x, y pairs, in the style's colour and width. */
export function penStroke(points: number[], style: MarkStyle) {
  return { id: newId(), points, color: style.color, width: style.width };
}

/** A solid straight line between two points, in the style's colour and width. */
export function straightLine(from: BoardPoint, to: BoardPoint, style: MarkStyle): ShapeItem {
  return {
    id: newId(),
    shape: 'line',
    points: [from.x, from.y, to.x, to.y],
    fill: null,
    stroke: { color: style.color, width: style.width, dash: 'solid' },
    rotation: 0,
  };
}

/** A shape is drawn corner to corner, whichever way round it was dragged. */
export function shapeBetween(
  kind: ShapeGeneratorKind,
  from: BoardPoint,
  to: BoardPoint,
  style: MarkStyle,
  filled = false
): ShapeItem {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.abs(to.x - from.x);
  const h = Math.abs(to.y - from.y);
  const boxy = kind === 'rect' || kind === 'ellipse';
  return {
    id: newId(),
    shape: boxy ? (kind as 'rect' | 'ellipse') : 'polygon',
    points: boxy ? [x, y, w, h] : generateShapePoints(kind, x, y, w, h),
    fill: filled ? { type: 'solid', color: style.fillColor ?? style.color } : null,
    stroke: { color: style.color, width: style.width, dash: style.dash ?? 'solid' },
    rotation: 0,
    shadow: style.shadow ? { ...MARK_SHADOW } : null,
  };
}

/** Words written at a point, left-aligned, taking size, colour, outline, shadow and lines from the style. */
export function wordsAt(at: BoardPoint, text: string, style: MarkStyle): TextItem {
  return {
    id: newId(),
    x: at.x,
    y: at.y,
    text,
    fontSize: style.fontSize,
    color: style.color,
    bold: false,
    italic: false,
    align: 'left',
    outline: outlineFor(style),
    shadow: style.shadow ? { ...MARK_SHADOW } : null,
    underline: !!style.underline,
    strike: !!style.strike,
  };
}

/** A sticker goes down around where it was put, at the size and shape it actually is. */
export function stickerAt(
  at: BoardPoint,
  imageIdentifier: string,
  fallback: number,
  natural?: BoardPoint,
  room?: NaturalSize
): ImageItem {
  const { w, h } = stickerSize(fallback, natural, room);
  return { id: newId(), imageIdentifier, x: at.x, y: at.y, w, h, rotation: 0, opacity: 1 };
}

/**
 * How big a picture goes down: the size it actually is.
 *
 * A screenshot stuck onto a board at some size of the board's choosing has to be dragged back
 * out to the size it already was, and never quite gets there. It only gives way when it will
 * not fit on the sheet at all, where leaving it be would put its own corners out of reach.
 */
export function stickerSize(fallback: number, natural?: BoardPoint, room?: NaturalSize): { w: number; h: number } {
  const wide = natural && natural.x > 0 ? natural.x : 0;
  const tall = natural && natural.y > 0 ? natural.y : 0;
  if (wide <= 0 || tall <= 0) return { w: fallback, h: fallback };

  const spare = room && room.w > 0 && room.h > 0 ? Math.min(room.w / wide, room.h / tall, 1) : 1;
  return { w: wide * spare, h: tall * spare };
}

/**
 * Rubs out what the eraser passed over, and leaves the rest of the stroke standing.
 *
 * A line rubbed through the middle is two lines afterwards, not none, which is what an
 * eraser does to ink and what the map editor's own rubbing out already works out per stroke.
 */
export function rubOutStrokes(layer: FreehandLayer, x: number, y: number, radius: number): boolean {
  const kept: FreehandLayer['strokes'] = [];
  let rubbed = false;

  for (const stroke of layer.strokes) {
    const runs = eraseStrokeAtPoint(stroke, x, y, radius);
    if (!runs) {
      kept.push(stroke);
      continue;
    }
    rubbed = true;
    for (const run of runs) kept.push({ ...run, id: newId() });
  }

  layer.strokes = kept;
  return rubbed;
}

/** How long the head of an arrow is against its shaft, and how wide it opens. */
const ARROW_HEAD = 0.22;

const ARROW_SPREAD = 0.4;

/**
 * An arrow, as a shaft with two barbs drawn back from its point.
 *
 * A line with nothing on the end of it says two things are joined; an arrow says which way
 * round, which is most of what anyone draws on a board to explain something.
 */
export function arrowBetween(from: BoardPoint, to: BoardPoint, style: MarkStyle): ShapeItem {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const head = Math.min(length * ARROW_HEAD, style.width * 6 + 16);
  const ux = dx / length;
  const uy = dy / length;
  const back = { x: to.x - ux * head, y: to.y - uy * head };
  const wing = head * ARROW_SPREAD;

  return {
    id: newId(),
    shape: 'polyline',
    points: [
      from.x,
      from.y,
      to.x,
      to.y,
      back.x - uy * wing,
      back.y + ux * wing,
      to.x,
      to.y,
      back.x + uy * wing,
      back.y - ux * wing,
    ],
    fill: null,
    stroke: { color: style.color, width: style.width, dash: 'solid' },
    rotation: 0,
  };
}

/** A note: words on a card, which moves and is thrown away as the one thing. */
export function noteAt(at: BoardPoint, text: string, style: MarkStyle, card: string): TextItem {
  return { ...wordsAt(at, text, style), background: card };
}

/** Ink that lets what is under it show through, for marking up rather than drawing. */
export function highlighterStyle(style: MarkStyle): MarkStyle {
  return { ...style, color: withAlpha(style.color, 0.38), width: Math.max(style.width * 3, 14) };
}

/** A `#rrggbb` colour as `rgba()` at an alpha; any other colour string comes back unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) return color;
  const r = parseInt(hex[1].slice(0, 2), 16);
  const g = parseInt(hex[1].slice(2, 4), 16);
  const b = parseInt(hex[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * How far a point may sit off the line between its neighbours before it is worth keeping.
 *
 * A pen reports a point every few milliseconds, so a stroke drawn slowly carries hundreds of
 * them, most saying nothing the two either side did not. They cost synchronisation and make
 * the line jitter where the hand did.
 */
const SMOOTH_SLACK = 1.1;

/** Thins a freehand stroke down to the points that carry its shape, and rounds the corners. */
export function smoothStroke(points: readonly number[]): number[] {
  if (points.length <= 6) return [...points];
  const kept = thin(points, 0, points.length / 2 - 1, SMOOTH_SLACK);
  if (kept.length <= 6) return kept;

  // Each kept point is pulled a quarter of the way towards each of its neighbours, which
  // takes the wobble out of a hand-drawn line without moving where the line goes.
  const eased = [kept[0], kept[1]];
  for (let i = 2; i < kept.length - 2; i += 2) {
    eased.push(
      kept[i] * 0.5 + kept[i - 2] * 0.25 + kept[i + 2] * 0.25,
      kept[i + 1] * 0.5 + kept[i - 1] * 0.25 + kept[i + 3] * 0.25
    );
  }
  eased.push(kept[kept.length - 2], kept[kept.length - 1]);
  return eased;
}

/** Douglas-Peucker: keeps the point furthest off the line, and asks the same of each half. */
function thin(points: readonly number[], first: number, last: number, slack: number): number[] {
  const ax = points[first * 2];
  const ay = points[first * 2 + 1];
  const bx = points[last * 2];
  const by = points[last * 2 + 1];
  let worst = 0;
  let at = first;

  for (let i = first + 1; i < last; i++) {
    const off = awayFromLine(points[i * 2], points[i * 2 + 1], ax, ay, bx, by);
    if (off > worst) {
      worst = off;
      at = i;
    }
  }
  if (worst <= slack) return [ax, ay, bx, by];
  return [...thin(points, first, at, slack).slice(0, -2), ...thin(points, at, last, slack)];
}

function awayFromLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const span = dx * dx + dy * dy;
  if (span === 0) return Math.hypot(px - ax, py - ay);
  const along = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / span));
  return Math.hypot(px - (ax + along * dx), py - (ay + along * dy));
}

/**
 * A line through as many points as were set down, straight or curved.
 *
 * Two points make a connector between two boxes; a diagram wants one that goes round the
 * boxes in between, which a line between two points cannot do.
 */
export function pathThrough(points: readonly BoardPoint[], style: MarkStyle, curved: boolean): ShapeItem | null {
  if (points.length < 2) return null;
  return {
    id: newId(),
    shape: curved ? 'curve' : 'polyline',
    points: points.flatMap((at) => [at.x, at.y]),
    fill: null,
    stroke: { color: style.color, width: style.width, dash: style.dash ?? 'solid' },
    rotation: 0,
    shadow: style.shadow ? { ...MARK_SHADOW } : null,
  };
}

/** How big a picture is in its own pixels, before anything was trimmed off it. */
export interface NaturalSize {
  w: number;
  h: number;
}

/** The picture held, so its crop can be read and written. */
export function pictureOf(scene: MapScene, ref: MarkRef): ImageItem | null {
  if (ref.kind !== 'image') return null;
  for (const layer of scene.layers) {
    if (layer.kind !== 'image') continue;
    const item = layer.items.find((entry) => entry.id === ref.id);
    if (item) return item;
  }
  return null;
}
