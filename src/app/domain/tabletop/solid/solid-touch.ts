import type { FlatPoint, FootprintPart } from '@axe/domain/tabletop/solid/range-footprint';
import type { Solid, SolidFrame } from '@axe/domain/tabletop/solid/solid';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/** How far outside a solid a point may lie and still touch it, in table pixels: the edge counts as in. */
const ON_EDGE_PX = 1e-6;

/** How many halvings the search for the nearest point of a cone takes, far past a pixel for any table. */
const CONE_SEARCH_STEPS = 80;

/**
 * Whether any part of the straight piece from `from` to `to` lies in the solid, its edge included.
 * A piece standing on the table is read as the upright line through its middle from its foot to the
 * top of its body, which this is asked of.
 */
export function solidTouchesSegment(solid: Solid, from: Vec3, to: Vec3): boolean {
  switch (solid.kind) {
    case 'sphere':
      return distanceToSegment(solid.centre, from, to) <= solid.radius + ON_EDGE_PX;
    case 'column':
      return columnTouches(solid.parts, solid.bottom, solid.top, from, to);
    case 'beam':
      return beamTouches(solid, from, to);
    case 'cone':
      return coneTouches(solid, from, to);
  }
}

function columnTouches(parts: readonly FootprintPart[], bottom: number, top: number, from: Vec3, to: Vec3): boolean {
  const span = clipToRange(from.z, to.z - from.z, bottom, top, [0, 1]);
  if (!span) return false;
  const a: FlatPoint = { x: from.x + (to.x - from.x) * span[0], y: from.y + (to.y - from.y) * span[0] };
  const b: FlatPoint = { x: from.x + (to.x - from.x) * span[1], y: from.y + (to.y - from.y) * span[1] };
  return parts.some((part) =>
    part.kind === 'circle'
      ? flatDistanceToSegment(part.centre, a, b) <= part.radius + ON_EDGE_PX
      : segmentTouchesConvexPolygon(a, b, part.corners)
  );
}

function beamTouches(beam: Extract<Solid, { kind: 'beam' }>, from: Vec3, to: Vec3): boolean {
  const a = intoFrame(from, beam.start, beam.frame);
  const b = intoFrame(to, beam.start, beam.frame);
  let span: [number, number] | null = [0, 1];
  span = clipToRange(a.x, b.x - a.x, 0, beam.length, span);
  if (span) span = clipToRange(a.y, b.y - a.y, -beam.halfWidth, beam.halfWidth, span);
  if (span) span = clipToRange(a.z, b.z - a.z, -beam.halfWidth, beam.halfWidth, span);
  return span !== null;
}

/**
 * Whether the piece reaches into a cone. How far a point lies outside the cone, read the most of
 * behind its tip, past its end and out from its side, rises and falls only once along a straight
 * piece, so the least of it is found by closing in from both ends.
 */
function coneTouches(cone: Extract<Solid, { kind: 'cone' }>, from: Vec3, to: Vec3): boolean {
  const a = intoFrame(from, cone.apex, cone.frame);
  const b = intoFrame(to, cone.apex, cone.frame);
  const opening = cone.length > 0 ? cone.endRadius / cone.length : 0;
  const outside = (t: number): number => {
    const along = a.x + (b.x - a.x) * t;
    const across = Math.hypot(a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    return Math.max(-along, along - cone.length, (across - along * opening) / Math.sqrt(1 + opening * opening));
  };
  let low = 0;
  let high = 1;
  for (let step = 0; step < CONE_SEARCH_STEPS; step++) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    if (outside(left) <= outside(right)) high = right;
    else low = left;
  }
  return Math.min(outside(0), outside(1), outside((low + high) / 2)) <= ON_EDGE_PX;
}

/** A point in a frame's own ways from its origin: along it, across it to the right, and up across it. */
function intoFrame(point: Vec3, origin: Vec3, frame: SolidFrame): Vec3 {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  return {
    x: dx * frame.way.x + dy * frame.way.y + dz * frame.way.z,
    y: dx * frame.side.x + dy * frame.side.y + dz * frame.side.z,
    z: dx * frame.lift.x + dy * frame.lift.y + dz * frame.lift.z,
  };
}

/**
 * The part of a span of a straight piece, as shares of the way along it, where one of its measures,
 * starting at `start` and changing by `change` over the whole piece, lies between `low` and `high`;
 * null where none of it does.
 */
function clipToRange(
  start: number,
  change: number,
  low: number,
  high: number,
  span: [number, number] | null
): [number, number] | null {
  if (!span) return null;
  const lo = low - ON_EDGE_PX;
  const hi = high + ON_EDGE_PX;
  if (Math.abs(change) < 1e-12) return start >= lo && start <= hi ? span : null;
  let enter = (lo - start) / change;
  let leave = (hi - start) / change;
  if (enter > leave) [enter, leave] = [leave, enter];
  const from = Math.max(span[0], enter);
  const to = Math.min(span[1], leave);
  return from <= to ? [from, to] : null;
}

function distanceToSegment(point: Vec3, from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = dx * dx + dy * dy + dz * dz;
  const t =
    length > 0
      ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy + (point.z - from.z) * dz) / length))
      : 0;
  return Math.hypot(from.x + dx * t - point.x, from.y + dy * t - point.y, from.z + dz * t - point.z);
}

function flatDistanceToSegment(point: FlatPoint, from: FlatPoint, to: FlatPoint): number {
  return distanceToSegment({ ...point, z: 0 }, { ...from, z: 0 }, { ...to, z: 0 });
}

/** Whether a flat piece from `a` to `b` touches a convex polygon whose corners run either way round. */
function segmentTouchesConvexPolygon(a: FlatPoint, b: FlatPoint, corners: readonly FlatPoint[]): boolean {
  if (corners.length < 3) return false;
  if (insideConvex(a, corners) || insideConvex(b, corners)) return true;
  for (let i = 0; i < corners.length; i++) {
    if (segmentsCross(a, b, corners[i], corners[(i + 1) % corners.length])) return true;
  }
  return false;
}

function insideConvex(point: FlatPoint, corners: readonly FlatPoint[]): boolean {
  let sign = 0;
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % corners.length];
    const cross = (q.x - p.x) * (point.y - p.y) - (q.y - p.y) * (point.x - p.x);
    const edge = Math.hypot(q.x - p.x, q.y - p.y);
    if (Math.abs(cross) <= ON_EDGE_PX * Math.max(1, edge)) continue;
    const side = Math.sign(cross);
    if (sign === 0) sign = side;
    else if (side !== sign) return false;
  }
  return true;
}

function segmentsCross(a: FlatPoint, b: FlatPoint, c: FlatPoint, d: FlatPoint): boolean {
  const orient = (p: FlatPoint, q: FlatPoint, r: FlatPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    flatDistanceToSegment(a, c, d) <= ON_EDGE_PX ||
    flatDistanceToSegment(b, c, d) <= ON_EDGE_PX ||
    flatDistanceToSegment(c, a, b) <= ON_EDGE_PX ||
    flatDistanceToSegment(d, a, b) <= ON_EDGE_PX
  );
}
