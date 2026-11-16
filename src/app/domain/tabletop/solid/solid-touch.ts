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

/**
 * How far along the straight piece from `from` to `to` it first comes into the solid, as a share of
 * the way from 0 to 1; 0 where it starts inside, and null where it never does. A line of sight is
 * asked of as a long enough piece of it.
 */
export function solidEntryAlong(solid: Solid, from: Vec3, to: Vec3): number | null {
  switch (solid.kind) {
    case 'sphere':
      return sphereEntry(solid.centre, solid.radius, from, to);
    case 'column':
      return columnEntry(solid.parts, solid.bottom, solid.top, from, to);
    case 'beam': {
      const a = intoFrame(from, solid.start, solid.frame);
      const b = intoFrame(to, solid.start, solid.frame);
      let span: [number, number] | null = [0, 1];
      span = clipToRange(a.x, b.x - a.x, 0, solid.length, span, 0);
      if (span) span = clipToRange(a.y, b.y - a.y, -solid.halfWidth, solid.halfWidth, span, 0);
      if (span) span = clipToRange(a.z, b.z - a.z, -solid.halfWidth, solid.halfWidth, span, 0);
      return span ? span[0] : null;
    }
    case 'cone':
      return coneEntry(solid, from, to);
  }
}

function sphereEntry(centre: Vec3, radius: number, from: Vec3, to: Vec3): number | null {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const f = { x: from.x - centre.x, y: from.y - centre.y, z: from.z - centre.z };
  const a = d.x * d.x + d.y * d.y + d.z * d.z;
  const b = 2 * (f.x * d.x + f.y * d.y + f.z * d.z);
  const c = f.x * f.x + f.y * f.y + f.z * f.z - radius * radius;
  if (c <= 0) return 0;
  if (a === 0) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const enter = (-b - Math.sqrt(disc)) / (2 * a);
  return enter >= 0 && enter <= 1 ? enter : null;
}

function columnEntry(
  parts: readonly FootprintPart[],
  bottom: number,
  top: number,
  from: Vec3,
  to: Vec3
): number | null {
  const slab = clipToRange(from.z, to.z - from.z, bottom, top, [0, 1], 0);
  if (!slab) return null;
  let first: number | null = null;
  for (const part of parts) {
    const span =
      part.kind === 'circle'
        ? circleSpan(part.centre, part.radius, from, to, slab)
        : polygonSpan(part.corners, from, to, slab);
    if (span && (first === null || span[0] < first)) first = span[0];
  }
  return first;
}

/** The part of a span of a piece, seen from above, that lies within a circle. */
function circleSpan(
  centre: FlatPoint,
  radius: number,
  from: Vec3,
  to: Vec3,
  span: [number, number]
): [number, number] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - centre.x;
  const fy = from.y - centre.y;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - radius * radius;
  if (a < 1e-12) return c <= 0 ? span : null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const enter = Math.max(span[0], (-b - root) / (2 * a));
  const leave = Math.min(span[1], (-b + root) / (2 * a));
  return enter <= leave ? [enter, leave] : null;
}

/** The part of a span of a piece, seen from above, that lies within a convex polygon running either way round. */
function polygonSpan(
  corners: readonly FlatPoint[],
  from: Vec3,
  to: Vec3,
  span: [number, number]
): [number, number] | null {
  if (corners.length < 3) return null;
  const middle = {
    x: corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length,
    y: corners.reduce((sum, corner) => sum + corner.y, 0) / corners.length,
  };
  let clipped: [number, number] | null = span;
  for (let i = 0; i < corners.length && clipped; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % corners.length];
    const edge = Math.hypot(q.x - p.x, q.y - p.y);
    if (edge < 1e-12) continue;
    let nx = -(q.y - p.y) / edge;
    let ny = (q.x - p.x) / edge;
    if (nx * (middle.x - p.x) + ny * (middle.y - p.y) < 0) [nx, ny] = [-nx, -ny];
    const start = nx * (from.x - p.x) + ny * (from.y - p.y);
    const change = nx * (to.x - from.x) + ny * (to.y - from.y);
    clipped = clipToRange(start, change, 0, Number.POSITIVE_INFINITY, clipped, 0);
  }
  return clipped;
}

function coneEntry(cone: Extract<Solid, { kind: 'cone' }>, from: Vec3, to: Vec3): number | null {
  const outside = coneOutside(cone, from, to);
  const nearest = nearestAlong(outside);
  if (outside(nearest) > ON_EDGE_PX) return null;
  if (outside(0) <= ON_EDGE_PX) return 0;
  let low = 0;
  let high = nearest;
  for (let step = 0; step < CONE_SEARCH_STEPS; step++) {
    const middle = (low + high) / 2;
    if (outside(middle) <= 0) high = middle;
    else low = middle;
  }
  return high;
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
  const outside = coneOutside(cone, from, to);
  return outside(nearestAlong(outside)) <= ON_EDGE_PX;
}

/** How far outside a cone the point a share of the way along a piece lies; less than nought within it. */
function coneOutside(cone: Extract<Solid, { kind: 'cone' }>, from: Vec3, to: Vec3): (t: number) => number {
  const a = intoFrame(from, cone.apex, cone.frame);
  const b = intoFrame(to, cone.apex, cone.frame);
  const opening = cone.length > 0 ? cone.endRadius / cone.length : 0;
  const slant = Math.sqrt(1 + opening * opening);
  return (t) => {
    const along = a.x + (b.x - a.x) * t;
    const across = Math.hypot(a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    return Math.max(-along, along - cone.length, (across - along * opening) / slant);
  };
}

/** Where along a piece, as a share of the way, a measure that falls and then rises only once is least. */
function nearestAlong(measure: (t: number) => number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < CONE_SEARCH_STEPS; step++) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    if (measure(left) <= measure(right)) high = right;
    else low = left;
  }
  const middle = (low + high) / 2;
  const ends: [number, number][] = [
    [0, measure(0)],
    [1, measure(1)],
    [middle, measure(middle)],
  ];
  return ends.reduce((best, end) => (end[1] < best[1] ? end : best))[0];
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
  span: [number, number] | null,
  slack = ON_EDGE_PX
): [number, number] | null {
  if (!span) return null;
  const lo = low - slack;
  const hi = high + slack;
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
