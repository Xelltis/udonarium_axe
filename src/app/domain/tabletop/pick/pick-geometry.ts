import { TablePoint, TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';

/** A point across the board, in table pixels. */
export interface PickPoint2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Something solid standing on the board: an outline, which may have dents as the outline of a
 * block of several hex cells does, stood up from a base to a top. A top that slopes says how high
 * it stands over each point; `top` is then the highest it goes.
 */
export interface PickPrism {
  readonly kind: 'prism';
  readonly outline: readonly PickPoint2[];
  readonly base: number;
  readonly top: number;
  readonly roofAt?: (x: number, y: number) => number;
}

/**
 * A flat four-cornered thing, such as a picture standing up or a card lying down. The corners go
 * round in order; across is from the first towards the second, and down from the first towards the
 * fourth, which is how a picture laid on it is read.
 */
export interface PickQuad {
  readonly kind: 'quad';
  readonly corners: readonly [TablePoint, TablePoint, TablePoint, TablePoint];
}

/** A round thing standing upright, such as a coin or the base a piece stands on. */
export interface PickCylinder {
  readonly kind: 'cylinder';
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly base: number;
  readonly top: number;
}

/** A flat outline lying at one height, such as an area painted on the board. */
export interface PickFloor {
  readonly kind: 'floor';
  readonly outline: readonly PickPoint2[];
  readonly z: number;
}

/**
 * A shape laid out on a face that need not lie on the board, such as a block stuck to a white board
 * stood up: the shape is read in the face's own axes, across it, down it and out of it, as the
 * board reads the shapes standing on it.
 */
export interface PickOnFace {
  readonly kind: 'on-face';
  readonly frame: SurfaceFrame;
  readonly shape: PickPrism | PickQuad | PickCylinder | PickFloor;
}

/**
 * A sheet laid over a box of the board that follows the raised ground, as a range lying over it does:
 * how high it lies over each point of the box, between a lowest and a highest. A picture laid on it
 * is read across the box from its left edge and down it from its top edge.
 */
export interface PickDraped {
  readonly kind: 'draped';
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly heightAt: (x: number, y: number) => number;
  readonly low: number;
  readonly high: number;
}

export type PickShape = PickPrism | PickQuad | PickCylinder | PickFloor | PickOnFace | PickDraped;

/** Where a line of sight meets a shape. */
export interface PickShapeHit {
  /** How far along the line, from its origin; nearer the eye is less. */
  readonly t: number;
  readonly point: TablePoint;
  /** For a quad: how far across and down it the point lies, each from 0 to 1. */
  readonly u?: number;
  readonly v?: number;
}

/** How finely a sloping top is walked before the crossing is narrowed down. */
const ROOF_STEPS = 24;
const ROOF_REFINES = 20;
const EPSILON = 1e-9;

function at(ray: TableRay, t: number): TablePoint {
  return {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t,
    z: ray.origin.z + ray.direction.z * t,
  };
}

/**
 * Whether a point lies inside an outline or no further than `reach` off any of its sides, as a line
 * drawn round it and the softened edge of its picture reach past it.
 */
export function withinOutline(outline: readonly PickPoint2[], x: number, y: number, reach: number): boolean {
  if (insideOutline(outline, x, y)) return true;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j];
    const b = outline[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const share = length > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
    if (Math.hypot(x - (a.x + dx * share), y - (a.y + dy * share)) <= reach) return true;
  }
  return false;
}

/** Whether a point lies inside an outline, by how many of its sides a line to the east crosses. */
export function insideOutline(outline: readonly PickPoint2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Where the line crosses the level z, or null when it runs level. */
function crossingLevel(ray: TableRay, z: number): number | null {
  if (Math.abs(ray.direction.z) < EPSILON) return null;
  return (z - ray.origin.z) / ray.direction.z;
}

function hitFloor(ray: TableRay, shape: PickFloor): PickShapeHit | null {
  const t = crossingLevel(ray, shape.z);
  if (t === null) return null;
  const point = at(ray, t);
  return insideOutline(shape.outline, point.x, point.y) ? { t, point } : null;
}

function hitQuad(ray: TableRay, shape: PickQuad): PickShapeHit | null {
  const [c0, c1, , c3] = shape.corners;
  const ax = c1.x - c0.x;
  const ay = c1.y - c0.y;
  const az = c1.z - c0.z;
  const bx = c3.x - c0.x;
  const by = c3.y - c0.y;
  const bz = c3.z - c0.z;
  // The face's normal, and where the line meets its plane.
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const facing = nx * ray.direction.x + ny * ray.direction.y + nz * ray.direction.z;
  if (Math.abs(facing) < EPSILON) return null;
  const t = (nx * (c0.x - ray.origin.x) + ny * (c0.y - ray.origin.y) + nz * (c0.z - ray.origin.z)) / facing;
  const point = at(ray, t);
  // Across and down, as the parts of the point from the first corner along the two sides.
  const px = point.x - c0.x;
  const py = point.y - c0.y;
  const pz = point.z - c0.z;
  const aa = ax * ax + ay * ay + az * az;
  const bb = bx * bx + by * by + bz * bz;
  const ab = ax * bx + ay * by + az * bz;
  const pa = px * ax + py * ay + pz * az;
  const pb = px * bx + py * by + pz * bz;
  const det = aa * bb - ab * ab;
  if (Math.abs(det) < EPSILON) return null;
  const u = (pa * bb - pb * ab) / det;
  const v = (pb * aa - pa * ab) / det;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { t, point, u, v };
}

function hitCylinder(ray: TableRay, shape: PickCylinder): PickShapeHit | null {
  const candidates: number[] = [];
  for (const z of [shape.top, shape.base]) {
    const t = crossingLevel(ray, z);
    if (t === null) continue;
    const point = at(ray, t);
    if (Math.hypot(point.x - shape.centerX, point.y - shape.centerY) <= shape.radius) candidates.push(t);
  }
  const ox = ray.origin.x - shape.centerX;
  const oy = ray.origin.y - shape.centerY;
  const a = ray.direction.x ** 2 + ray.direction.y ** 2;
  if (a > EPSILON) {
    const b = 2 * (ox * ray.direction.x + oy * ray.direction.y);
    const c = ox * ox + oy * oy - shape.radius ** 2;
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const z = ray.origin.z + ray.direction.z * t;
        if (z >= shape.base && z <= shape.top) candidates.push(t);
      }
    }
  }
  return nearest(ray, candidates);
}

/** The nearest of several crossings, or null where there are none. */
function nearest(ray: TableRay, candidates: readonly number[]): PickShapeHit | null {
  if (candidates.length < 1) return null;
  const t = Math.min(...candidates);
  return { t, point: at(ray, t) };
}

/** Where the line meets the vertical side from a to b, between the heights the side stands to. */
function hitSide(
  ray: TableRay,
  a: PickPoint2,
  b: PickPoint2,
  base: number,
  topAt: (x: number, y: number) => number
): number | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  // The side's plane is upright, so only the line's run across the board matters.
  const denominator = ray.direction.x * ey - ray.direction.y * ex;
  if (Math.abs(denominator) < EPSILON) return null;
  const qx = a.x - ray.origin.x;
  const qy = a.y - ray.origin.y;
  const t = (qx * ey - qy * ex) / denominator;
  const s = (qx * ray.direction.y - qy * ray.direction.x) / denominator;
  if (s < 0 || s > 1) return null;
  const point = at(ray, t);
  return point.z >= base && point.z <= topAt(point.x, point.y) ? t : null;
}

function hitPrism(ray: TableRay, shape: PickPrism): PickShapeHit | null {
  const topAt = shape.roofAt ?? (() => shape.top);
  const candidates: number[] = [];
  for (let i = 0; i < shape.outline.length; i++) {
    const t = hitSide(ray, shape.outline[i], shape.outline[(i + 1) % shape.outline.length], shape.base, topAt);
    if (t !== null) candidates.push(t);
  }
  const levels = shape.roofAt ? [shape.base] : [shape.base, shape.top];
  for (const z of levels) {
    const t = crossingLevel(ray, z);
    if (t === null) continue;
    const point = at(ray, t);
    if (insideOutline(shape.outline, point.x, point.y)) candidates.push(t);
  }
  if (shape.roofAt) {
    const t = hitRoof(ray, shape);
    if (t !== null) candidates.push(t);
  }
  return nearest(ray, candidates);
}

/**
 * The stretch of the line inside the box that holds a solid: across its outline's extent and up
 * from its base to its top. Null where the line passes the box by.
 */
function spanInside(ray: TableRay, shape: PickPrism): [number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of shape.outline) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  let from = -Infinity;
  let to = Infinity;
  const slabs: [number, number, number, number][] = [
    [ray.origin.x, ray.direction.x, minX, maxX],
    [ray.origin.y, ray.direction.y, minY, maxY],
    [ray.origin.z, ray.direction.z, shape.base, shape.top],
  ];
  for (const [origin, direction, low, high] of slabs) {
    if (Math.abs(direction) < EPSILON) {
      if (origin < low || origin > high) return null;
      continue;
    }
    const t1 = (low - origin) / direction;
    const t2 = (high - origin) / direction;
    from = Math.max(from, Math.min(t1, t2));
    to = Math.min(to, Math.max(t1, t2));
  }
  return from <= to ? [from, to] : null;
}

/**
 * Where the line first goes under a sloping top. The stretch of the line inside the solid's box is
 * walked in steps, and the step that goes under is halved down to the crossing.
 */
function hitRoof(ray: TableRay, shape: PickPrism): number | null {
  const roofAt = shape.roofAt!;
  const span = spanInside(ray, shape);
  if (!span) return null;
  const [from, to] = span;
  const under = (t: number) => {
    const point = at(ray, t);
    return insideOutline(shape.outline, point.x, point.y) && point.z <= roofAt(point.x, point.y);
  };
  let previous = from;
  for (let i = 1; i <= ROOF_STEPS; i++) {
    const t = from + ((to - from) * i) / ROOF_STEPS;
    if (under(t)) {
      let low = previous;
      let high = t;
      for (let j = 0; j < ROOF_REFINES; j++) {
        const middle = (low + high) / 2;
        if (under(middle)) high = middle;
        else low = middle;
      }
      return high;
    }
    previous = t;
  }
  return null;
}

/** Where a line of sight first meets a shape, or null where it misses it. */
function dot(a: TablePoint, b: TablePoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function hitOnFace(ray: TableRay, shape: PickOnFace): PickShapeHit | null {
  const { origin, u, v, normal } = shape.frame;
  const from = { x: ray.origin.x - origin.x, y: ray.origin.y - origin.y, z: ray.origin.z - origin.z };
  const local: TableRay = {
    origin: { x: dot(from, u), y: dot(from, v), z: dot(from, normal) },
    direction: { x: dot(ray.direction, u), y: dot(ray.direction, v), z: dot(ray.direction, normal) },
  };
  const hit = hitShape(local, shape.shape);
  if (!hit) return null;
  const { x, y, z } = hit.point;
  return {
    ...hit,
    point: {
      x: origin.x + u.x * x + v.x * y + normal.x * z,
      y: origin.y + u.y * x + v.y * y + normal.y * z,
      z: origin.z + u.z * x + v.z * y + normal.z * z,
    },
  };
}

export function hitShape(ray: TableRay, shape: PickShape): PickShapeHit | null {
  switch (shape.kind) {
    case 'prism':
      return hitPrism(ray, shape);
    case 'quad':
      return hitQuad(ray, shape);
    case 'cylinder':
      return hitCylinder(ray, shape);
    case 'floor':
      return hitFloor(ray, shape);
    case 'on-face':
      return hitOnFace(ray, shape);
    case 'draped':
      return hitDraped(ray, shape);
  }
}

/**
 * Where the line first comes down onto a sheet following the ground, walked over the stretch of it
 * above the box as a sloping roof is, with how far across and down the box the point lies. A sheet has
 * no sides: a line already under it where it comes over the box meets none of it.
 */
function hitDraped(ray: TableRay, shape: PickDraped): PickShapeHit | null {
  const { x, y, width, height } = shape.box;
  if (!(width > 0) || !(height > 0)) return null;
  const outline = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  const span = spanInside(ray, { kind: 'prism', outline, base: shape.low, top: shape.high });
  if (!span) return null;
  const [from, to] = span;
  const under = (t: number) => {
    const point = at(ray, t);
    return insideOutline(outline, point.x, point.y) && point.z <= shape.heightAt(point.x, point.y);
  };
  const start = at(ray, from);
  const startX = Math.min(Math.max(start.x, x), x + width);
  const startY = Math.min(Math.max(start.y, y), y + height);
  if (start.z <= shape.heightAt(startX, startY)) return null;
  let previous = from;
  for (let i = 1; i <= ROOF_STEPS; i++) {
    const t = from + ((to - from) * i) / ROOF_STEPS;
    if (under(t)) {
      let low = previous;
      let high = t;
      for (let j = 0; j < ROOF_REFINES; j++) {
        const middle = (low + high) / 2;
        if (under(middle)) high = middle;
        else low = middle;
      }
      const point = at(ray, high);
      return { t: high, point, u: (point.x - x) / width, v: (point.y - y) / height };
    }
    previous = t;
  }
  return null;
}
