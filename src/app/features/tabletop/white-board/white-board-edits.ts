import {
  MapScene,
  newId,
  sceneHeightPx,
  sceneWidthPx,
  ShapeItem,
  StrokeDash,
  TextAlign,
  TextItem,
} from '@axe/features/map-editor/model/scene';
import {
  BoardPoint,
  boxAround,
  boxOf,
  MarkBox,
  MarkRef,
} from '@axe/features/tabletop/white-board/white-board-geometry';
import { MARK_SHADOW, NaturalSize, pictureOf, withAlpha } from '@axe/features/tabletop/white-board/white-board-marks';

/** Moves whatever was taken hold of, whichever sort of mark it turned out to be. */
export function moveMark(scene: MapScene, ref: MarkRef, dx: number, dy: number): void {
  for (const layer of scene.layers) {
    if (ref.kind === 'image' && layer.kind === 'image') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) {
        item.x += dx;
        item.y += dy;
      }
    }
    if (ref.kind === 'text' && layer.kind === 'text') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) {
        item.x += dx;
        item.y += dy;
      }
    }
    if (ref.kind === 'shape' && layer.kind === 'shape') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) shiftPoints(item, dx, dy);
    }
    if (ref.kind === 'stroke' && layer.kind === 'freehand') {
      const item = layer.strokes.find((entry) => entry.id === ref.id);
      if (item) item.points = item.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
    }
  }
}

function shiftPoints(item: ShapeItem, dx: number, dy: number): void {
  if (item.shape === 'rect' || item.shape === 'ellipse') {
    item.points = [item.points[0] + dx, item.points[1] + dy, item.points[2], item.points[3]];
    return;
  }
  item.points = item.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
}

/** Stretches whatever was taken hold of, about its own top left corner. */
export function scaleMark(scene: MapScene, ref: MarkRef, box: MarkBox, kx: number, ky: number): void {
  const grow = (x: number, y: number): [number, number] => [box.x + (x - box.x) * kx, box.y + (y - box.y) * ky];

  for (const layer of scene.layers) {
    if (ref.kind === 'image' && layer.kind === 'image') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) {
        const [x, y] = grow(item.x, item.y);
        item.x = x;
        item.y = y;
        item.w *= kx;
        item.h *= ky;
      }
    }
    if (ref.kind === 'text' && layer.kind === 'text') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) item.fontSize = Math.max(6, item.fontSize * Math.max(kx, ky));
    }
    if (ref.kind === 'shape' && layer.kind === 'shape') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (!item) continue;
      if (item.shape === 'rect' || item.shape === 'ellipse') {
        const [x, y] = grow(item.points[0], item.points[1]);
        item.points = [x, y, item.points[2] * kx, item.points[3] * ky];
      } else {
        item.points = item.points.map((value, index) => (index % 2 === 0 ? grow(value, 0)[0] : grow(0, value)[1]));
      }
    }
    if (ref.kind === 'stroke' && layer.kind === 'freehand') {
      const item = layer.strokes.find((entry) => entry.id === ref.id);
      if (item)
        item.points = item.points.map((value, index) => (index % 2 === 0 ? grow(value, 0)[0] : grow(0, value)[1]));
    }
  }
}

/** Takes a mark off the board, whichever sort it is. */
export function removeMark(scene: MapScene, ref: MarkRef): void {
  for (const layer of scene.layers) {
    if (ref.kind === 'image' && layer.kind === 'image') layer.items = layer.items.filter((e) => e.id !== ref.id);
    if (ref.kind === 'text' && layer.kind === 'text') layer.items = layer.items.filter((e) => e.id !== ref.id);
    if (ref.kind === 'shape' && layer.kind === 'shape') layer.items = layer.items.filter((e) => e.id !== ref.id);
    if (ref.kind === 'stroke' && layer.kind === 'freehand')
      layer.strokes = layer.strokes.filter((e) => e.id !== ref.id);
  }
}

/** A copy of what is held, set down a little off the original so both can be seen. */
export function copyMark(scene: MapScene, ref: MarkRef, offset: number): MarkRef | null {
  for (const layer of scene.layers) {
    if (ref.kind === 'image' && layer.kind === 'image') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) {
        const made = { ...item, id: newId(), x: item.x + offset, y: item.y + offset };
        layer.items.push(made);
        return { kind: 'image', id: made.id };
      }
    }
    if (ref.kind === 'text' && layer.kind === 'text') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) {
        const made = {
          ...item,
          id: newId(),
          x: item.x + offset,
          y: item.y + offset,
          outline: item.outline ? { ...item.outline } : item.outline,
          shadow: item.shadow ? { ...item.shadow } : item.shadow,
        };
        layer.items.push(made);
        return { kind: 'text', id: made.id };
      }
    }
    if (ref.kind === 'shape' && layer.kind === 'shape') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) {
        // How a mark is dressed is kept in objects of its own, and restyling one writes into
        // them. Handed on as they stand, recolouring the copy would recolour what it came from.
        const made = {
          ...item,
          id: newId(),
          points: [...item.points],
          stroke: item.stroke ? { ...item.stroke } : item.stroke,
          fill: item.fill ? { ...item.fill } : item.fill,
          shadow: item.shadow ? { ...item.shadow } : item.shadow,
        };
        layer.items.push(made);
        shiftPoints(made, offset, offset);
        return { kind: 'shape', id: made.id };
      }
    }
    if (ref.kind === 'stroke' && layer.kind === 'freehand') {
      const item = layer.strokes.find((entry) => entry.id === ref.id);
      if (item) {
        const made = {
          ...item,
          id: newId(),
          points: item.points.map((value, index) => value + (index % 2 === 0 ? offset : offset)),
        };
        layer.strokes.push(made);
        return { kind: 'stroke', id: made.id };
      }
    }
  }
  return null;
}

/** Brings a mark forward or sends it back within the sheet it is on. */
export function restack(scene: MapScene, ref: MarkRef, delta: number): void {
  for (const layer of scene.layers) {
    const list: { id: string }[] | null =
      ref.kind === 'image' && layer.kind === 'image'
        ? layer.items
        : ref.kind === 'text' && layer.kind === 'text'
          ? layer.items
          : ref.kind === 'shape' && layer.kind === 'shape'
            ? layer.items
            : ref.kind === 'stroke' && layer.kind === 'freehand'
              ? layer.strokes
              : null;
    if (!list) continue;
    const at = list.findIndex((entry) => entry.id === ref.id);
    if (at < 0) continue;
    const to = Math.min(list.length - 1, Math.max(0, at + delta));
    if (to === at) return;
    const [taken] = list.splice(at, 1);
    list.splice(to, 0, taken);
    return;
  }
}

/** Turns a mark about its own middle, in degrees. */
export function turnMark(scene: MapScene, ref: MarkRef, degrees: number): void {
  const box = boxOf(scene, ref);
  if (!box) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const turn = (x: number, y: number): [number, number] => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos,
  ];

  for (const layer of scene.layers) {
    if (ref.kind === 'image' && layer.kind === 'image') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (item) item.rotation = (item.rotation + degrees) % 360;
    }
    if (ref.kind === 'shape' && layer.kind === 'shape') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (!item) continue;
      if (item.shape === 'rect' || item.shape === 'ellipse') item.rotation = (item.rotation + degrees) % 360;
      else item.points = mapPairs(item.points, turn);
    }
    if (ref.kind === 'stroke' && layer.kind === 'freehand') {
      const item = layer.strokes.find((entry) => entry.id === ref.id);
      if (item) item.points = mapPairs(item.points, turn);
    }
  }
}

function mapPairs(points: readonly number[], turn: (x: number, y: number) => [number, number]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const [x, y] = turn(points[i], points[i + 1]);
    out.push(x, y);
  }
  return out;
}

/** What a mark is drawn in, so what is already on the board can be changed rather than redrawn. */
export interface MarkStyleChange {
  color?: string;
  width?: number;
  fontSize?: number;
  background?: string | null;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  dash?: StrokeDash;
  filled?: boolean;
  fillColor?: string;
  shadow?: boolean;
  outline?: string;
  outlineWidth?: number;
  underline?: boolean;
  strike?: boolean;
}

/**
 * Restyles what is held.
 *
 * A line drawn in the wrong colour would otherwise be a line to be rubbed out and drawn again,
 * which is not how anything else works: the ink settings reach what is already down, not only
 * what is next.
 */
export function restyleMark(scene: MapScene, ref: MarkRef, change: MarkStyleChange): void {
  for (const layer of scene.layers) {
    if (ref.kind === 'stroke' && layer.kind === 'freehand') {
      const item = layer.strokes.find((entry) => entry.id === ref.id);
      if (!item) continue;
      if (change.color) item.color = item.color.startsWith('rgba') ? withAlpha(change.color, 0.38) : change.color;
      if (change.width) item.width = change.width;
    }
    if (ref.kind === 'shape' && layer.kind === 'shape') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (!item) continue;
      if (item.stroke) {
        if (change.color) item.stroke.color = change.color;
        if (change.width) item.stroke.width = change.width;
        if (change.dash) item.stroke.dash = change.dash;
      }
      if (change.filled !== undefined) {
        const paint = change.fillColor ?? (item.fill?.type === 'solid' ? item.fill.color : null);
        item.fill = change.filled ? { type: 'solid', color: paint ?? item.stroke?.color ?? '#000000' } : null;
      } else if (change.fillColor && item.fill?.type === 'solid') {
        item.fill = { type: 'solid', color: change.fillColor };
      }
      if (change.shadow !== undefined) item.shadow = change.shadow ? { ...MARK_SHADOW } : null;
    }
    if (ref.kind === 'text' && layer.kind === 'text') {
      const item = layer.items.find((entry) => entry.id === ref.id);
      if (!item) continue;
      if (change.color) item.color = change.color;
      if (change.fontSize) item.fontSize = change.fontSize;
      if (change.bold !== undefined) item.bold = change.bold;
      if (change.italic !== undefined) item.italic = change.italic;
      if (change.align) item.align = change.align;
      if (change.background !== undefined) item.background = change.background ?? undefined;
      if (change.underline !== undefined) item.underline = change.underline;
      if (change.strike !== undefined) item.strike = change.strike;
      if (change.shadow !== undefined) item.shadow = change.shadow ? { ...MARK_SHADOW } : null;
      if (change.outline !== undefined || change.outlineWidth !== undefined) {
        const width = change.outlineWidth ?? (item.outline ? (item.outline.width / item.fontSize) * 100 : 0);
        const colour = change.outline ?? item.outline?.color ?? '#ffffff';
        item.outline = width > 0 ? { color: colour, width: (item.fontSize * width) / 100 } : null;
      }
    }
  }
}

/** The words already written, so they can be typed over rather than written again. */
export function wordsOf(scene: MapScene, ref: MarkRef): TextItem | null {
  if (ref.kind !== 'text') return null;
  for (const layer of scene.layers) {
    if (layer.kind !== 'text') continue;
    const item = layer.items.find((entry) => entry.id === ref.id);
    if (item) return item;
  }
  return null;
}

export type AlignEdge = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Puts what is held in the middle of the sheet, keeping the marks where they are to each other.
 *
 * Lining marks up against one another and putting them in the middle of the page are two
 * different jobs: a title centred on its neighbours is still off to one side of the slide.
 * They move as one thing, so a group laid out carefully is not pulled apart by being centred.
 */
export function centreOnSheet(scene: MapScene, refs: readonly MarkRef[], way: 'across' | 'down' | 'both'): void {
  const bounds = boxAround(scene, refs);
  if (!bounds) return;

  const dx = way === 'down' ? 0 : (sceneWidthPx(scene) - bounds.w) / 2 - bounds.x;
  const dy = way === 'across' ? 0 : (sceneHeightPx(scene) - bounds.h) / 2 - bounds.y;
  if (!dx && !dy) return;
  for (const ref of refs) moveMark(scene, ref, dx, dy);
}

/**
 * Lines several marks up against one another.
 *
 * Nudging each one by hand until they look level is what anyone does without this, and they
 * never quite are. They are lined up against the box that holds all of them.
 */
export function alignMarks(scene: MapScene, refs: readonly MarkRef[], edge: AlignEdge): void {
  const bounds = boxAround(scene, refs);
  if (!bounds || refs.length < 2) return;

  for (const ref of refs) {
    const box = boxOf(scene, ref);
    if (!box) continue;
    let dx = 0;
    let dy = 0;
    if (edge === 'left') dx = bounds.x - box.x;
    if (edge === 'right') dx = bounds.x + bounds.w - (box.x + box.w);
    if (edge === 'centre') dx = bounds.x + bounds.w / 2 - (box.x + box.w / 2);
    if (edge === 'top') dy = bounds.y - box.y;
    if (edge === 'bottom') dy = bounds.y + bounds.h - (box.y + box.h);
    if (edge === 'middle') dy = bounds.y + bounds.h / 2 - (box.y + box.h / 2);
    if (dx || dy) moveMark(scene, ref, dx, dy);
  }
}

/** Sets even gaps between them, along whichever way they are more spread out. */
export function spreadMarks(scene: MapScene, refs: readonly MarkRef[], along: 'x' | 'y'): void {
  if (refs.length < 3) return;
  const measured = refs
    .map((ref) => ({ ref, box: boxOf(scene, ref) }))
    .filter((entry): entry is { ref: MarkRef; box: MarkBox } => entry.box !== null)
    .sort((left, right) => left.box[along] - right.box[along]);
  if (measured.length < 3) return;

  const first = measured[0].box;
  const last = measured[measured.length - 1].box;
  const span = along === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const filled = measured.reduce((total, entry) => total + (along === 'x' ? entry.box.w : entry.box.h), 0);
  const gap = (span - filled) / (measured.length - 1);

  let at = along === 'x' ? first.x : first.y;
  for (const entry of measured) {
    const was = along === 'x' ? entry.box.x : entry.box.y;
    const shift = at - was;
    if (shift) moveMark(scene, entry.ref, along === 'x' ? shift : 0, along === 'y' ? shift : 0);
    at += (along === 'x' ? entry.box.w : entry.box.h) + gap;
  }
}

/** Turns a picture over, which is how anyone makes a figure face the other way. */
export function flipMark(scene: MapScene, ref: MarkRef, way: 'across' | 'down'): void {
  if (ref.kind !== 'image') return;
  for (const layer of scene.layers) {
    if (layer.kind !== 'image') continue;
    const item = layer.items.find((entry) => entry.id === ref.id);
    if (!item) continue;
    if (way === 'across') item.flipX = !item.flipX;
    else item.flipY = !item.flipY;
  }
}

/** How solid a picture is, so one can be laid under the rest as a tracing to work over. */
export function fadeMark(scene: MapScene, ref: MarkRef, opacity: number): void {
  if (ref.kind !== 'image') return;
  for (const layer of scene.layers) {
    if (layer.kind !== 'image') continue;
    const item = layer.items.find((entry) => entry.id === ref.id);
    if (item) item.opacity = Math.min(1, Math.max(0, opacity));
  }
}

/**
 * Trims a picture down to the part of it that is wanted.
 *
 * A screenshot arrives with a window frame and a taskbar round what was actually being shown.
 * Shrinking it only makes the frame smaller; the frame has to come off.
 *
 * The window is given in the drawn picture's own pixels, and is kept in the source picture's,
 * so a picture already trimmed can be trimmed again without the first trim being lost.
 */
export function cropMark(scene: MapScene, ref: MarkRef, window: MarkBox, natural: NaturalSize): void {
  const item = pictureOf(scene, ref);
  if (!item || item.w <= 0 || item.h <= 0) return;
  const was = item.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
  if (was.w <= 0 || was.h <= 0) return;

  const left = Math.max(0, Math.min(window.x, item.w));
  const top = Math.max(0, Math.min(window.y, item.h));
  const right = Math.max(left, Math.min(window.x + window.w, item.w));
  const bottom = Math.max(top, Math.min(window.y + window.h, item.h));
  if (right - left < 1 || bottom - top < 1) return;

  const acrossPer = was.w / item.w;
  const downPer = was.h / item.h;
  item.crop = {
    x: was.x + left * acrossPer,
    y: was.y + top * downPer,
    w: (right - left) * acrossPer,
    h: (bottom - top) * downPer,
  };
  // The picture shrinks to what is left of it, kept where its top left corner already was.
  item.x = item.x - item.w / 2 + left + (right - left) / 2;
  item.y = item.y - item.h / 2 + top + (bottom - top) / 2;
  item.w = right - left;
  item.h = bottom - top;
}

/** Puts back everything a picture was trimmed of, at the size it is being shown. */
export function uncropMark(scene: MapScene, ref: MarkRef, natural: NaturalSize): void {
  const item = pictureOf(scene, ref);
  if (!item?.crop) return;
  const grown = item.crop.w > 0 ? natural.w / item.crop.w : 1;
  item.w *= grown;
  item.h *= item.crop.h > 0 ? natural.h / item.crop.h : 1;
  delete item.crop;
}

/** The shapes that are a run of points rather than a box, and so have corners to take hold of. */
const JOINTED = new Set<ShapeItem['shape']>(['line', 'polyline', 'curve', 'polygon', 'closedCurve']);

/** The shape held, if it is one whose corners can be moved about one at a time. */
export function jointedShape(scene: MapScene, ref: MarkRef): ShapeItem | null {
  if (ref.kind !== 'shape') return null;
  for (const layer of scene.layers) {
    if (layer.kind !== 'shape') continue;
    const item = layer.items.find((entry) => entry.id === ref.id);
    if (item) return JOINTED.has(item.shape) ? item : null;
  }
  return null;
}

/** Which corner of a path the pointer landed on, counted in corners rather than in numbers. */
export function jointUnder(scene: MapScene, ref: MarkRef, at: BoardPoint, slack: number): number | null {
  const item = jointedShape(scene, ref);
  if (!item) return null;
  for (let joint = 0; joint * 2 + 1 < item.points.length; joint += 1) {
    const x = item.points[joint * 2];
    const y = item.points[joint * 2 + 1];
    if (Math.abs(at.x - x) <= slack && Math.abs(at.y - y) <= slack) return joint;
  }
  return null;
}

/** Moves one corner of a path or other jointed shape to a point; does nothing when there is no such corner. */
export function moveJoint(scene: MapScene, ref: MarkRef, joint: number, to: BoardPoint): void {
  const item = jointedShape(scene, ref);
  if (!item || joint * 2 + 1 >= item.points.length) return;
  item.points[joint * 2] = to.x;
  item.points[joint * 2 + 1] = to.y;
}

/**
 * Puts a new corner into the run where the pointer landed, on whichever stretch it landed on.
 *
 * A path drawn in one go is never quite the path that was wanted, and redrawing the whole
 * thing to move one bend is the sort of thing that makes people stop using a tool.
 */
export function addJoint(scene: MapScene, ref: MarkRef, at: BoardPoint, slack: number): number | null {
  const item = jointedShape(scene, ref);
  if (!item || item.points.length < 4) return null;

  let nearest = -1;
  let closest = slack;
  for (let joint = 0; joint * 2 + 3 < item.points.length; joint += 1) {
    const away = awayFromSegment(
      at,
      { x: item.points[joint * 2], y: item.points[joint * 2 + 1] },
      { x: item.points[joint * 2 + 2], y: item.points[joint * 2 + 3] }
    );
    if (away <= closest) {
      closest = away;
      nearest = joint;
    }
  }
  if (nearest < 0) return null;
  item.points.splice(nearest * 2 + 2, 0, at.x, at.y);
  return nearest + 1;
}

/** Takes a corner out, so long as two are left, a path with one point being nothing at all. */
export function dropJoint(scene: MapScene, ref: MarkRef, joint: number): boolean {
  const item = jointedShape(scene, ref);
  if (!item || item.points.length <= 4 || joint * 2 + 1 >= item.points.length) return false;
  item.points.splice(joint * 2, 2);
  return true;
}

function awayFromSegment(at: BoardPoint, from: BoardPoint, to: BoardPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = dx * dx + dy * dy;
  if (span === 0) return Math.hypot(at.x - from.x, at.y - from.y);
  const along = Math.max(0, Math.min(1, ((at.x - from.x) * dx + (at.y - from.y) * dy) / span));
  return Math.hypot(at.x - (from.x + along * dx), at.y - (from.y + along * dy));
}
