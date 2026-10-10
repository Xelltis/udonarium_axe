import { SlopeGridKind, SlopeSide, slopeSideAzimuth, slopeSideNormal } from '@axe/domain/tabletop/terrain-slope';

/** A point on a block's top, in pixels from the corner the block is drawn from. */
export interface SlopePoint {
  x: number;
  y: number;
}

/** A flat piece of a slope, as the height it stands at over any point: `z = a x + b y + c`. */
export interface SlopePlane {
  a: number;
  b: number;
  c: number;
}

/** One flat piece of a slope: the part of the top that runs down to a single side. */
export interface SlopeFace {
  /** The side this piece runs down to. */
  side: SlopeSide;
  /** Its outline on the top of the block, in pixels from the corner the block is drawn from. */
  polygon: SlopePoint[];
  /** The height it stands at over any point of that outline. */
  plane: SlopePlane;
  /** The way it runs down, in radians clockwise from the top of the screen. */
  azimuth: number;
}

/** A slope, as the flat pieces it is made of and the way it is measured. */
export interface SlopeRoof {
  faces: SlopeFace[];
  /** How high the block stands where its slope is highest, in pixels. */
  heightPx: number;
  /** How far the surface climbs for each pixel away from a side. */
  pitch: number;
  sides: SlopeSideLine[];
}

interface SlopeSideLine {
  side: SlopeSide;
  nx: number;
  ny: number;
  offset: number;
}

const EPSILON = 1e-6;

/**
 * Works out the slope of a block, as the flat pieces it is made of.
 *
 * Every side the block slopes to reaches the ground, and the surface climbs away from all of
 * them at the same pitch, so it comes out flat over the whole top where one side slopes, a
 * ridge where two opposite sides do, and a point over the middle where every side does: a
 * pyramid on a square block, and a hexagonal one on a hex block. The pitch is the one that
 * puts the block's full height at the point furthest from any sloping side, which for a
 * single side is the far side of the block, as a slope has always read.
 *
 * Nothing comes back for a block that slopes to no side, or for one with no height to slope
 * down.
 */
export function buildSlopeRoof(
  outline: readonly SlopePoint[],
  sides: readonly SlopeSide[],
  heightPx: number,
  kind: SlopeGridKind = 'square'
): SlopeRoof | null {
  if (outline.length < 3 || sides.length < 1 || !(heightPx > 0)) return null;

  const lines: SlopeSideLine[] = sides.map((side) => {
    const normal = slopeSideNormal(side, kind);
    let offset = -Infinity;
    for (const point of outline) offset = Math.max(offset, normal.x * point.x + normal.y * point.y);
    return { side, nx: normal.x, ny: normal.y, offset };
  });

  const regions = lines.map((line, index) => {
    let polygon = [...outline];
    for (let other = 0; other < lines.length && polygon.length > 2; other++) {
      if (other === index) continue;
      polygon = clipHalfPlane(polygon, nearerSide(line, lines[other]));
    }
    return polygon;
  });

  let deepest = 0;
  regions.forEach((polygon, index) => {
    for (const point of polygon) deepest = Math.max(deepest, depthInto(lines[index], point));
  });
  if (deepest <= EPSILON) return null;

  const pitch = heightPx / deepest;
  const faces: SlopeFace[] = [];
  regions.forEach((polygon, index) => {
    const line = lines[index];
    const tidied = withoutRepeats(polygon);
    if (tidied.length < 3) return;
    faces.push({
      side: line.side,
      polygon: tidied,
      plane: { a: -pitch * line.nx, b: -pitch * line.ny, c: pitch * line.offset },
      azimuth: slopeSideAzimuth(line.side, kind),
    });
  });
  if (faces.length < 1) return null;

  return { faces, heightPx, pitch, sides: lines };
}

/** How high the surface of a slope stands over a point of the block's top, in pixels. */
export function slopeHeightAt(roof: SlopeRoof, x: number, y: number): number {
  let nearest = Infinity;
  for (const line of roof.sides) nearest = Math.min(nearest, depthInto(line, { x, y }));
  return Math.min(roof.heightPx, Math.max(0, nearest * roof.pitch));
}

/**
 * How high the surface stands along a line drawn across the block, as the heights at the ends
 * and wherever the surface changes the side it runs down to.
 *
 * A wall stands under this: it is as tall as the slope over it, and folds wherever the slope
 * does.
 */
export function slopeProfileAlong(
  roof: SlopeRoof,
  from: SlopePoint,
  to: SlopePoint
): { at: number; heightPx: number }[] {
  const stops = new Set([0, 1]);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (let i = 0; i < roof.sides.length; i++) {
    for (let j = i + 1; j < roof.sides.length; j++) {
      const one = roof.sides[i];
      const other = roof.sides[j];
      // The two run level where their depths meet, which is one point along a straight line.
      const slope = (other.nx - one.nx) * dx + (other.ny - one.ny) * dy;
      if (Math.abs(slope) < EPSILON) continue;
      const at = -(one.offset - other.offset + (other.nx - one.nx) * from.x + (other.ny - one.ny) * from.y) / slope;
      if (at > EPSILON && at < 1 - EPSILON) stops.add(at);
    }
  }
  return [...stops]
    .sort((a, b) => a - b)
    .map((at) => ({ at, heightPx: slopeHeightAt(roof, from.x + dx * at, from.y + dy * at) }));
}

function depthInto(line: SlopeSideLine, point: SlopePoint): number {
  return line.offset - (line.nx * point.x + line.ny * point.y);
}

/** Where this side is the nearer of the two, as a test that is at most nought inside it. */
function nearerSide(line: SlopeSideLine, other: SlopeSideLine): (point: SlopePoint) => number {
  return (point) => depthInto(line, point) - depthInto(other, point);
}

function clipHalfPlane(polygon: readonly SlopePoint[], inside: (point: SlopePoint) => number): SlopePoint[] {
  const kept: SlopePoint[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const here = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const atHere = inside(here);
    const atNext = inside(next);
    if (atHere <= EPSILON) kept.push(here);
    if ((atHere > EPSILON && atNext < -EPSILON) || (atHere < -EPSILON && atNext > EPSILON)) {
      const along = atHere / (atHere - atNext);
      kept.push({ x: here.x + (next.x - here.x) * along, y: here.y + (next.y - here.y) * along });
    }
  }
  return kept;
}

function withoutRepeats(polygon: readonly SlopePoint[]): SlopePoint[] {
  const kept: SlopePoint[] = [];
  for (const point of polygon) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(last.x - point.x) < EPSILON && Math.abs(last.y - point.y) < EPSILON) continue;
    kept.push(point);
  }
  const first = kept[0];
  const last = kept[kept.length - 1];
  if (
    kept.length > 1 &&
    first &&
    last &&
    Math.abs(first.x - last.x) < EPSILON &&
    Math.abs(first.y - last.y) < EPSILON
  ) {
    kept.pop();
  }
  return kept;
}
