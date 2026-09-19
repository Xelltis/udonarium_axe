import { footprintOf, type ReplayBoardScene } from '@axe/domain/replay/replay-board-view';
import type { ReplayRoutePoint } from '@axe/domain/replay/replay-route';

/** The part of the table a frame shows, in table pixels, already in the shape of the frame. */
export interface ReplayCameraFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How close the camera comes: `action` frames what moved as tightly as it can, `speaker` frames
 * whoever is talking with room around them, and `wide` frames every piece on the table.
 */
export type ReplayCameraShot = 'action' | 'speaker' | 'wide';

/** The fewest cells across the camera ever frames, so a lone piece is seen in its surroundings. */
const MIN_CELLS: Readonly<Record<ReplayCameraShot, number>> = { action: 12, speaker: 16, wide: 16 };
const PAD_CELLS: Readonly<Record<ReplayCameraShot, number>> = { action: 3, speaker: 4, wide: 2 };

/**
 * Where the camera should come to rest for a moment of the video.
 *
 * It frames the pieces named, and the points given (the way a piece moved), with a margin of
 * cells round them; the whole table's pieces when none of the named ones is on it, and the whole
 * table when there are no pieces at all. The frame is widened to the shape of the picture and
 * kept on the table where the table is large enough.
 */
export function replayCameraTarget(
  scene: ReplayBoardScene,
  focus: readonly string[],
  aspect: number,
  shot: ReplayCameraShot,
  points: readonly ReplayRoutePoint[] = []
): ReplayCameraFrame {
  const grid = scene.gridSize;
  const table = { x: 0, y: 0, width: scene.width * grid, height: scene.height * grid };
  const wanted = new Set(focus);
  const chosen = shot === 'wide' ? scene.pieces : scene.pieces.filter((piece) => wanted.has(piece.identifier));
  const framed = chosen.length > 0 || points.length > 0 ? chosen : scene.pieces;
  const effectiveShot = framed === chosen || points.length > 0 ? shot : 'wide';

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const piece of framed) {
    const size = footprintOf(piece, grid);
    left = Math.min(left, piece.x);
    top = Math.min(top, piece.y);
    right = Math.max(right, piece.x + size.width);
    bottom = Math.max(bottom, piece.y + size.height);
  }
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x + grid);
    bottom = Math.max(bottom, point.y + grid);
  }
  if (!Number.isFinite(left)) return fitAspect(table, aspect, table);

  const pad = PAD_CELLS[effectiveShot] * grid;
  const box = { x: left - pad, y: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 };
  const minWidth = MIN_CELLS[effectiveShot] * grid;
  if (box.width < minWidth) {
    box.x -= (minWidth - box.width) / 2;
    box.width = minWidth;
  }
  return fitAspect(box, aspect, table);
}

/** A frame grown to the shape of the picture about its middle, then kept on the table. */
function fitAspect(box: ReplayCameraFrame, aspect: number, table: ReplayCameraFrame): ReplayCameraFrame {
  let { width, height } = box;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  return {
    x: keepOn(centreX - width / 2, width, table.x, table.width),
    y: keepOn(centreY - height / 2, height, table.y, table.height),
    width,
    height,
  };
}

/** Keeps a span on the table when the table is wide enough for it, and centres it on the table otherwise. */
function keepOn(start: number, span: number, tableStart: number, tableSpan: number): number {
  if (span >= tableSpan) return tableStart + (tableSpan - span) / 2;
  return Math.min(tableStart + tableSpan - span, Math.max(tableStart, start));
}

/**
 * The camera part of the way from one frame to another.
 *
 * The middle moves evenly and the size by ratio, so a zoom feels the same speed whether it goes in
 * or out.
 */
export function blendReplayCamera(from: ReplayCameraFrame, to: ReplayCameraFrame, progress: number): ReplayCameraFrame {
  const p = Math.min(1, Math.max(0, progress));
  if (p <= 0) return from;
  if (p >= 1) return to;
  const width = from.width * Math.pow(to.width / from.width, p);
  const height = from.height * Math.pow(to.height / from.height, p);
  const centreX = lerp(from.x + from.width / 2, to.x + to.width / 2, p);
  const centreY = lerp(from.y + from.height / 2, to.y + to.height / 2, p);
  return { x: centreX - width / 2, y: centreY - height / 2, width, height };
}

/** Slow to start and slow to stop, the way a camera operator moves. */
export function easeInOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}
