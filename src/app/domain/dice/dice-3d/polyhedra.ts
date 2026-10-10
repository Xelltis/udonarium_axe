import { add, cross, dot, length, normalize, scale, sub, Vec3 } from '@axe/domain/dice/dice-3d/rotation';

/** The shapes of die thrown on screen. */
export type DieShape = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export const DIE_SHAPES: readonly DieShape[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

/** A die's solid, with the number each of its faces carries. */
export interface Polyhedron {
  readonly shape: DieShape;
  /** The corners, scaled so the farthest stands one unit from the middle. */
  readonly vertices: readonly Vec3[];
  /** Each face's corners in order, turning anticlockwise seen from outside. */
  readonly faces: readonly (readonly number[])[];
  /** Each face's outward direction, of unit length. */
  readonly normals: readonly Vec3[];
  /** How far the faces stand from the middle, which is how high the die rests on one. */
  readonly inradius: number;
  /** Whether the die is read by the corner on top, as a d4 is, rather than by a face. */
  readonly readsCorners: boolean;
  /** The number on each face, or on each corner for a d4, in the usual numbering. */
  readonly values: readonly number[];
}

/**
 * How large each shape is thrown, as the reach of its farthest corner in the dice world's units.
 *
 * Each covers about the same patch of floor as it rests, so the dice of a mixed roll look one
 * size: a cube reaches less far from its middle than a d20 does for the room it takes, so it is
 * given the longer reach.
 */
const DIE_RADII: Readonly<Record<DieShape, number>> = {
  d4: 1.44,
  d6: 1.34,
  d8: 1.18,
  d10: 1.09,
  d12: 0.92,
  d20: 0.98,
};

/** How far the farthest corner of a thrown die stands from its middle. */
export function dieRadiusOf(shape: DieShape): number {
  return DIE_RADII[shape];
}

const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * How far the corner rings of a d10 stand above and below its middle, beside the unit radius of
 * the rings. The tips then stand a little under one unit away, which gives the usual long shape.
 */
const D10_RING_HEIGHT = 0.1;

const cache = new Map<DieShape, Polyhedron>();

/** The solid of a die shape, built once. */
export function polyhedronOf(shape: DieShape): Polyhedron {
  let poly = cache.get(shape);
  if (!poly) {
    poly = build(shape);
    cache.set(shape, poly);
  }
  return poly;
}

/** The face of a die that lies opposite another, which every shape here but the d4 has. */
export function oppositeFace(poly: Polyhedron, face: number): number {
  const n = poly.normals[face];
  let best = -1;
  let bestDot = Infinity;
  poly.normals.forEach((other, index) => {
    const d = dot(n, other);
    if (d < bestDot) {
      bestDot = d;
      best = index;
    }
  });
  return best;
}

function build(shape: DieShape): Polyhedron {
  switch (shape) {
    case 'd4':
      return buildD4();
    case 'd6':
      return buildD6();
    case 'd8':
      return fromNormals('d8', unitCorners(OCTAHEDRON), unitDirections(CUBE), 9);
    case 'd10':
      return buildD10();
    case 'd12':
      return fromNormals('d12', unitCorners(DODECAHEDRON), hullNormals(unitCorners(DODECAHEDRON)), 13);
    case 'd20':
      return fromNormals('d20', unitCorners(ICOSAHEDRON), hullNormals(unitCorners(ICOSAHEDRON)), 21);
  }
}

const CUBE: readonly Vec3[] = [
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
  [-1, 1, 1],
  [-1, 1, -1],
  [-1, -1, 1],
  [-1, -1, -1],
];

const OCTAHEDRON: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const ICOSAHEDRON: readonly Vec3[] = [
  [0, 1, PHI],
  [0, 1, -PHI],
  [0, -1, PHI],
  [0, -1, -PHI],
  [1, PHI, 0],
  [1, -PHI, 0],
  [-1, PHI, 0],
  [-1, -PHI, 0],
  [PHI, 0, 1],
  [PHI, 0, -1],
  [-PHI, 0, 1],
  [-PHI, 0, -1],
];

const DODECAHEDRON: readonly Vec3[] = [
  ...CUBE,
  [0, 1 / PHI, PHI],
  [0, 1 / PHI, -PHI],
  [0, -1 / PHI, PHI],
  [0, -1 / PHI, -PHI],
  [1 / PHI, PHI, 0],
  [1 / PHI, -PHI, 0],
  [-1 / PHI, PHI, 0],
  [-1 / PHI, -PHI, 0],
  [PHI, 0, 1 / PHI],
  [PHI, 0, -1 / PHI],
  [-PHI, 0, 1 / PHI],
  [-PHI, 0, -1 / PHI],
];

function buildD4(): Polyhedron {
  const vertices = unitCorners([
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ]);
  // Each face lies opposite one corner, so the face across from corner i points away from it.
  const normals = vertices.map((v) => scale(v, -1));
  const faces = facesAround(vertices, normals);
  return finish('d4', vertices, faces, true, [1, 2, 3, 4]);
}

function buildD6(): Polyhedron {
  const vertices = unitCorners(CUBE);
  // One on top and six beneath, two and five, three and four facing each other as on any die.
  const axes: [Vec3, number][] = [
    [[0, 0, 1], 1],
    [[1, 0, 0], 2],
    [[0, 1, 0], 3],
    [[0, -1, 0], 4],
    [[-1, 0, 0], 5],
    [[0, 0, -1], 6],
  ];
  const normals = axes.map(([axis]) => axis);
  const faces = facesAround(vertices, normals);
  return finish(
    'd6',
    vertices,
    faces,
    false,
    axes.map(([, value]) => value)
  );
}

function buildD10(): Polyhedron {
  const c = D10_RING_HEIGHT;
  const cos36 = Math.cos(Math.PI / 5);
  // The tips stand where every kite comes out flat: a ring corner below lies in the plane through
  // the tip and the two ring corners above it.
  const tip = (c * (1 + cos36)) / (1 - cos36);
  const raw: Vec3[] = [
    [0, 0, tip],
    [0, 0, -tip],
  ];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5;
    raw.push([Math.cos(a), Math.sin(a), c]);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5 + Math.PI / 5;
    raw.push([Math.cos(a), Math.sin(a), -c]);
  }
  const vertices = unitCorners(raw);
  const upper = (k: number) => 2 + (k % 5);
  const lower = (k: number) => 7 + (k % 5);
  const faces: number[][] = [];
  for (let k = 0; k < 5; k++) faces.push(orientOutward(vertices, [0, upper(k), lower(k), upper(k + 1)]));
  for (let k = 0; k < 5; k++) faces.push(orientOutward(vertices, [1, lower(k), upper(k + 1), lower(k + 1)]));
  const normals = faces.map((face) => faceNormal(vertices, face));
  return finish('d10', vertices, faces, false, oppositeNumbering(normals, 9));
}

function fromNormals(shape: DieShape, vertices: Vec3[], normals: Vec3[], oppositeSum: number): Polyhedron {
  const faces = facesAround(vertices, normals);
  return finish(shape, vertices, faces, false, oppositeNumbering(normals, oppositeSum));
}

function finish(
  shape: DieShape,
  vertices: Vec3[],
  faces: number[][],
  readsCorners: boolean,
  values: number[]
): Polyhedron {
  const normals = faces.map((face) => faceNormal(vertices, face));
  const inradius = Math.min(...faces.map((face, index) => dot(normals[index], vertices[face[0]])));
  return { shape, vertices, faces, normals, inradius, readsCorners, values };
}

/**
 * Numbers the faces so each pair facing each other adds up to the same sum, as real dice do: the
 * odd numbers go round one half in turn and the even ones fill the faces across from them.
 */
function oppositeNumbering(normals: Vec3[], sum: number): number[] {
  const values = new Array<number>(normals.length).fill(-1);
  const upper: number[] = [];
  normals.forEach((n, index) => {
    if (values[index] !== -1 || upper.includes(index)) return;
    const across = normals.findIndex((other, j) => j !== index && dot(n, other) < -1 + 1e-6);
    const first = before(n, normals[across]) ? index : across;
    upper.push(first);
    values[index] = values[across] = 0;
  });
  upper.sort((a, b) => {
    const na = normals[a];
    const nb = normals[b];
    if (Math.abs(na[2] - nb[2]) > 1e-6) return nb[2] - na[2];
    return Math.atan2(na[1], na[0]) - Math.atan2(nb[1], nb[0]);
  });
  upper.forEach((face, order) => {
    const value = 2 * order + 1;
    values[face] = value;
    const across = normals.findIndex((other, j) => j !== face && dot(normals[face], other) < -1 + 1e-6);
    values[across] = sum - value;
  });
  return values;
}

/** Which of two opposite directions counts as the upper one: the higher, then by y, then by x. */
function before(a: Vec3, b: Vec3): boolean {
  for (const axis of [2, 1, 0] as const) {
    if (Math.abs(a[axis] - b[axis]) > 1e-6) return a[axis] > b[axis];
  }
  return true;
}

/** The faces whose outward directions are given: the corners farthest along each, in turn about it. */
function facesAround(vertices: Vec3[], normals: Vec3[]): number[][] {
  return normals.map((n) => {
    const reach = Math.max(...vertices.map((v) => dot(v, n)));
    const members = vertices.map((v, index) => ({ v, index })).filter(({ v }) => dot(v, n) > reach - 1e-6);
    const centre = scale(
      members.reduce<Vec3>((sum, { v }) => add(sum, v), [0, 0, 0]),
      1 / members.length
    );
    const u = normalize(sub(members[0].v, centre));
    const w = cross(n, u);
    return members
      .map(({ v, index }) => {
        const d = sub(v, centre);
        return { index, angle: Math.atan2(dot(d, w), dot(d, u)) };
      })
      .sort((a, b) => a.angle - b.angle)
      .map(({ index }) => index);
  });
}

/** The face's corners turned to run anticlockwise seen from outside. */
function orientOutward(vertices: Vec3[], face: number[]): number[] {
  const normal = newell(vertices, face);
  const centre = face.reduce<Vec3>((sum, index) => add(sum, vertices[index]), [0, 0, 0]);
  return dot(normal, centre) < 0 ? [...face].reverse() : face;
}

function faceNormal(vertices: Vec3[], face: readonly number[]): Vec3 {
  return normalize(newell(vertices, face));
}

/** The area-weighted direction of a polygon, which holds even when its corners are not quite flat. */
function newell(vertices: Vec3[], face: readonly number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  face.forEach((index, i) => {
    const a = vertices[index];
    const b = vertices[face[(i + 1) % face.length]];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  });
  return [x, y, z];
}

/**
 * The outward directions of a convex solid's faces, found from its corners alone: every plane
 * through three corners that leaves all the others on one side is a face.
 */
function hullNormals(vertices: Vec3[]): Vec3[] {
  const found: Vec3[] = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      for (let k = j + 1; k < vertices.length; k++) {
        let n = normalize(cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i])));
        if (length(n) === 0) continue;
        let plane = dot(n, vertices[i]);
        if (plane < 0) {
          n = scale(n, -1);
          plane = -plane;
        }
        if (vertices.some((v) => dot(n, v) > plane + 1e-9)) continue;
        if (found.some((m) => dot(m, n) > 1 - 1e-9)) continue;
        found.push(n);
      }
    }
  }
  return found;
}

function unitCorners(points: readonly Vec3[]): Vec3[] {
  const reach = Math.max(...points.map(length));
  return points.map((p) => scale(p, 1 / reach));
}

function unitDirections(points: readonly Vec3[]): Vec3[] {
  return points.map(normalize);
}
