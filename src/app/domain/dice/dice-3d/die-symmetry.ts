import { DieShape, Polyhedron, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import {
  cross,
  dot,
  length,
  normalize,
  Quat,
  quatConjugate,
  quatFromColumns,
  quatMultiply,
  quatRotate,
  sameRotation,
  sub,
  UP,
  Vec3,
} from '@axe/domain/dice/dice-3d/rotation';

const EPSILON = 1e-6;

const groups = new Map<DieShape, readonly Quat[]>();

/**
 * Every turn that sets a die's solid back onto itself, worked out once per shape.
 *
 * Turning the drawn die by one of these leaves its outline where it was and moves only its
 * numbers, which is how a die that the physics landed on one face comes to show another.
 */
export function rotationGroupOf(shape: DieShape): readonly Quat[] {
  let group = groups.get(shape);
  if (!group) {
    group = findRotationGroup(polyhedronOf(shape));
    groups.set(shape, group);
  }
  return group;
}

/**
 * The face a die resting at this rotation shows: the one facing up, or for a d4 the corner on
 * top, which is the one across from the face it lies on.
 */
export function upFace(poly: Polyhedron, rotation: Quat): number {
  if (poly.readsCorners) {
    const down = extremeFace(poly, rotation, -1);
    return poly.vertices.findIndex((_, index) => !poly.faces[down].includes(index));
  }
  return extremeFace(poly, rotation, 1);
}

/**
 * How squarely the die sits on a face, from 1 for flat down to less as it leans: how close the
 * face it reads by points straight up, or for a d4 straight down.
 */
export function upAlignment(poly: Polyhedron, rotation: Quat): number {
  const sign = poly.readsCorners ? -1 : 1;
  return Math.max(...poly.normals.map((n) => sign * dot(quatRotate(rotation, n), UP)));
}

/**
 * The turn of the drawn die, inside its body, that brings the number to be shown to where the
 * physics left the number that came up.
 *
 * It is one of the solid's own symmetries, so the die looks the same before and after; only its
 * numbers move. A d4 is turned by its corners, the others by their faces.
 */
export function correctionFor(poly: Polyhedron, landed: number, target: number): Quat {
  return correctionsFor(poly, landed, target)[0];
}

/**
 * Every turn that would do for {@link correctionFor}: they differ in how far the number shown is
 * turned about the middle of its face, so one can be picked that sets it upright to the viewer.
 */
export function correctionsFor(poly: Polyhedron, landed: number, target: number): Quat[] {
  const from = poly.readsCorners ? poly.vertices[target] : poly.normals[target];
  const to = poly.readsCorners ? poly.vertices[landed] : poly.normals[landed];
  const fits = rotationGroupOf(poly.shape).filter((q) => dot(quatRotate(q, from), to) > 1 - EPSILON);
  if (fits.length === 0) throw new Error(`No turn of a ${poly.shape} carries ${target} to ${landed}`);
  return fits;
}

/** The face pointing most nearly up, or most nearly down. */
function extremeFace(poly: Polyhedron, rotation: Quat, sign: 1 | -1): number {
  let best = 0;
  let bestDot = -Infinity;
  poly.normals.forEach((n, index) => {
    const d = sign * dot(quatRotate(rotation, n), UP);
    if (d > bestDot) {
      bestDot = d;
      best = index;
    }
  });
  return best;
}

/**
 * Finds the solid's turns by trying where a corner and its neighbour could go: every other pair
 * of corners as far from the middle and as far apart fixes one candidate turn, which is kept when
 * it carries every corner onto a corner.
 */
function findRotationGroup(poly: Polyhedron): Quat[] {
  const vertices = poly.vertices;
  const a = vertices[0];
  const b = nearestNeighbour(vertices, 0);
  const span = dot(a, b);
  const frameOf = (x: Vec3, y: Vec3): Quat => {
    const ex = normalize(x);
    const ez = normalize(cross(x, y));
    const ey = cross(ez, ex);
    return quatFromColumns(ex, ey, ez);
  };
  const base = quatConjugate(frameOf(a, b));
  const found: Quat[] = [];
  vertices.forEach((x) => {
    if (Math.abs(length(x) - length(a)) > EPSILON) return;
    vertices.forEach((y) => {
      if (x === y || Math.abs(length(y) - length(b)) > EPSILON) return;
      if (Math.abs(dot(x, y) - span) > EPSILON) return;
      const turn = quatMultiply(frameOf(x, y), base);
      if (!mapsOntoItself(vertices, turn)) return;
      if (found.some((q) => sameRotation(q, turn))) return;
      found.push(turn);
    });
  });
  return found;
}

function nearestNeighbour(vertices: readonly Vec3[], from: number): Vec3 {
  let best = vertices[from === 0 ? 1 : 0];
  let bestDistance = Infinity;
  vertices.forEach((v, index) => {
    if (index === from) return;
    const d = length(sub(v, vertices[from]));
    if (d < bestDistance - EPSILON) {
      bestDistance = d;
      best = v;
    }
  });
  return best;
}

function mapsOntoItself(vertices: readonly Vec3[], turn: Quat): boolean {
  return vertices.every((v) => {
    const moved = quatRotate(turn, v);
    return vertices.some((w) => length(sub(moved, w)) < 1e-5);
  });
}
