import {
  MapLayer,
  MapScene,
  newId,
  SceneGuideLine,
  sceneHeightPx,
  sceneWidthPx,
} from '@axe/features/map-editor/model/scene';
import { BoardPoint, boxOf, MarkBox, MarkRef } from '@axe/features/tabletop/white-board/white-board-geometry';

/** Rounded onto the ruling, so what is drawn to a plan lines up with the rest of it. */
export function snapTo(at: BoardPoint, spacing: number): BoardPoint {
  if (spacing <= 1) return at;
  return { x: Math.round(at.x / spacing) * spacing, y: Math.round(at.y / spacing) * spacing };
}

/** A line the eye lines things up against: down the page constrains x, across it constrains y. */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
  /** How far the line is drawn, which is far enough to reach both things it lines up. */
  from: number;
  to: number;
}

export interface GuideSnap {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** How near a thing has to come to a line before the line takes it. */
export const GUIDE_SLACK = 6;

/**
 * Which lines what is being moved has come near, and how far to nudge it onto them.
 *
 * Graph paper only helps a mark that was laid down on the paper's own steps; two pictures of
 * unlike size never share a step, so their edges never agree however carefully they are
 * dragged. These are drawn off the other marks instead, so anything lines up with anything.
 */
export function guidesFor(
  scene: MapScene,
  moving: MarkBox,
  holding: readonly MarkRef[],
  spare: readonly SceneGuideLine[] = [],
  slack = GUIDE_SLACK
): GuideSnap {
  const held = new Set(holding.map((mark) => mark.kind + ':' + mark.id));
  const others: MarkBox[] = [];
  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    for (const mark of marksOn(layer)) {
      if (held.has(mark.kind + ':' + mark.id)) continue;
      const box = boxOf(scene, mark);
      if (box) others.push(box);
    }
  }

  const across = bestLine('x', moving, others, scene, spare, slack);
  const down = bestLine('y', moving, others, scene, spare, slack);
  return {
    dx: across?.shift ?? 0,
    dy: down?.shift ?? 0,
    guides: [...(across?.guides ?? []), ...(down?.guides ?? [])],
  };
}

/** Every mark on one sheet, named so the ones in hand can be told apart from the rest. */
function marksOn(layer: MapLayer): MarkRef[] {
  if (layer.kind === 'freehand') return layer.strokes.map((item) => ({ kind: 'stroke', id: item.id }));
  if (layer.kind === 'shape') return layer.items.map((item) => ({ kind: 'shape', id: item.id }));
  if (layer.kind === 'text') return layer.items.map((item) => ({ kind: 'text', id: item.id }));
  if (layer.kind === 'image') return layer.items.map((item) => ({ kind: 'image', id: item.id }));
  return [];
}

function bestLine(
  axis: 'x' | 'y',
  moving: MarkBox,
  others: readonly MarkBox[],
  scene: MapScene,
  spare: readonly SceneGuideLine[],
  slack: number
): { shift: number; guides: SnapGuide[] } | null {
  const near = axis === 'x' ? moving.x : moving.y;
  const span = axis === 'x' ? moving.w : moving.h;
  const mine = [near, near + span / 2, near + span];

  let shift = 0;
  let closest = slack + 1;
  let at = 0;
  for (const edge of mine) {
    for (const line of linesAlong(axis, others, scene, spare)) {
      const gap = Math.abs(line - edge);
      if (gap < closest) {
        closest = gap;
        shift = line - edge;
        at = line;
      }
    }
  }
  if (closest > slack) return null;

  // The line is drawn only as far as the things it joins, not right across the sheet.
  const touching = others.filter((box) => Math.abs(reachOf(axis, box, at)) < 0.5);
  const ends = [...touching, moving].flatMap((box) => (axis === 'x' ? [box.y, box.y + box.h] : [box.x, box.x + box.w]));
  const from = Math.min(...ends);
  const to = Math.max(...ends);
  return { shift, guides: [{ axis, at, from, to }] };
}

/** Nought where the box has an edge or a middle on the line, and something else where it has not. */
function reachOf(axis: 'x' | 'y', box: MarkBox, at: number): number {
  const near = axis === 'x' ? box.x : box.y;
  const span = axis === 'x' ? box.w : box.h;
  return Math.min(Math.abs(near - at), Math.abs(near + span / 2 - at), Math.abs(near + span - at));
}

function linesAlong(
  axis: 'x' | 'y',
  others: readonly MarkBox[],
  scene: MapScene,
  spare: readonly SceneGuideLine[]
): number[] {
  const lines: number[] = [];
  for (const box of others) {
    const near = axis === 'x' ? box.x : box.y;
    const span = axis === 'x' ? box.w : box.h;
    lines.push(near, near + span / 2, near + span);
  }
  // The middle of the sheet, which is what anything meant to be looked at is hung on.
  const sheet = axis === 'x' ? sceneWidthPx(scene) : sceneHeightPx(scene);
  lines.push(sheet / 2);
  for (const guide of spare) {
    if (guide.axis === axis) lines.push(guide.at);
  }
  return lines;
}

/**
 * Where a single point lands once it has given in to the nearest line.
 *
 * A grip being pulled is one point rather than a box, and it is that point which has to meet
 * the line: an edge dragged to a hair off another edge is the whole reason guides exist.
 */
export function snapPoint(
  scene: MapScene,
  at: BoardPoint,
  holding: readonly MarkRef[],
  spare: readonly SceneGuideLine[] = [],
  slack = GUIDE_SLACK
): { at: BoardPoint; guides: SnapGuide[] } {
  const snap = guidesFor(scene, { x: at.x, y: at.y, w: 0, h: 0 }, holding, spare, slack);
  return { at: { x: at.x + snap.dx, y: at.y + snap.dy }, guides: snap.guides };
}

/** The lines that are always there, whether or not the paper is ruled. */
export function sheetGuides(scene: MapScene): SnapGuide[] {
  const wide = sceneWidthPx(scene);
  const tall = sceneHeightPx(scene);
  return [
    { axis: 'x', at: wide / 2, from: 0, to: tall },
    { axis: 'y', at: tall / 2, from: 0, to: wide },
  ];
}

/** A guide left on the sheet, near enough to the pointer to be taken hold of. */
export function guideUnder(
  guides: readonly SceneGuideLine[],
  at: BoardPoint,
  slack = GUIDE_SLACK
): SceneGuideLine | null {
  for (const guide of guides) {
    const near = guide.axis === 'x' ? at.x : at.y;
    if (Math.abs(near - guide.at) <= slack) return guide;
  }
  return null;
}

/** A new guide line with an identifier of its own, across the given axis at a position. */
export function newGuide(axis: 'x' | 'y', at: number): SceneGuideLine {
  return { id: newId(), axis, at };
}

/** Steps a line onto eighths of a turn, so a connector meant to be square comes out square. */
export function squareOff(from: BoardPoint, to: BoardPoint): BoardPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const reach = Math.hypot(dx, dy);
  if (reach < 1) return to;
  const step = Math.PI / 4;
  const turn = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(turn) * reach, y: from.y + Math.sin(turn) * reach };
}
