import { DieShape, Polyhedron, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { add, cross, dot, length, normalize, scale, sub, Vec3 } from '@axe/domain/dice/dice-3d/rotation';

/** How round each shape's edges and corners are, beside the reach of its farthest corner. */
const ROUNDING: Readonly<Record<DieShape, number>> = {
  d4: 0.085,
  d6: 0.11,
  d8: 0.075,
  d10: 0.065,
  d12: 0.065,
  d20: 0.055,
};

/** How finely a rounded edge or corner is cut. */
const ARC_STEPS = 4;

/** Where each face's picture sits in the texture: one square cell per face, and one plain cell. */
export interface AtlasLayout {
  readonly columns: number;
  readonly rows: number;
  /** The cell drawn in the body's colour alone, which the rounded edges and corners take. */
  readonly plainCell: number;
}

/** A face of the die as it is laid out in its cell: its middle, which way is up, and its reach. */
export interface FaceFrame {
  readonly centre: Vec3;
  readonly up: Vec3;
  readonly right: Vec3;
  /** The distance from the middle to the farthest corner, which the cell spans twice over. */
  readonly reach: number;
}

/** The triangles of a rounded die, ready to hand to the drawing library. */
export interface DiceMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  /** The direction the texture runs across at each point, for its engraving to tilt the light by. */
  readonly tangents: Float32Array;
  readonly indices: Uint32Array;
  readonly atlas: AtlasLayout;
  readonly frames: readonly FaceFrame[];
}

const meshes = new Map<DieShape, DiceMeshData>();

/** The texture cells a shape's faces take. */
export function atlasOf(shape: DieShape): AtlasLayout {
  const cells = polyhedronOf(shape).faces.length + 1;
  const columns = Math.ceil(Math.sqrt(cells));
  return { columns, rows: Math.ceil(cells / columns), plainCell: cells - 1 };
}

/**
 * How each face is laid out in its cell. The top of a face points toward its first corner, as the
 * number on a triangle, kite or pentagon points at a corner, except on a d6, whose numbers stand
 * square to an edge.
 */
export function faceFramesOf(shape: DieShape): FaceFrame[] {
  const poly = polyhedronOf(shape);
  return poly.faces.map((face, index) => {
    const n = poly.normals[index];
    const corners = face.map((corner) => poly.vertices[corner]);
    const centre = scale(
      corners.reduce<Vec3>((sum, v) => add(sum, v), [0, 0, 0]),
      1 / corners.length
    );
    const toward = shape === 'd6' ? scale(add(corners[0], corners[1]), 0.5) : corners[0];
    const along = sub(toward, centre);
    const up = normalize(sub(along, scale(n, dot(along, n))));
    const right = cross(up, n);
    const reach = Math.max(...corners.map((v) => length(sub(v, centre))));
    return { centre, up, right, reach };
  });
}

/**
 * The rounded die of a shape, one unit to its farthest corner: every face keeps its plane, so it
 * rests on the table exactly where the physics has it, and every edge and corner is rounded off so
 * the light runs over it the way it does over a real die.
 */
export function diceMeshOf(shape: DieShape): DiceMeshData {
  let mesh = meshes.get(shape);
  if (!mesh) {
    mesh = buildMesh(polyhedronOf(shape));
    meshes.set(shape, mesh);
  }
  return mesh;
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly tangents: number[] = [];
  readonly indices: number[] = [];

  vertex(position: Vec3, normal: Vec3, uv: readonly [number, number], tangent: Vec3): number {
    this.positions.push(...position);
    this.normals.push(...normal);
    this.uvs.push(...uv);
    this.tangents.push(...tangent, 1);
    return this.positions.length / 3 - 1;
  }

  /** A triangle turned to face the way its corners' normals point. */
  triangle(a: number, b: number, c: number): void {
    const p = (i: number): Vec3 => [this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]];
    const n = (i: number): Vec3 => [this.normals[i * 3], this.normals[i * 3 + 1], this.normals[i * 3 + 2]];
    const facing = cross(sub(p(b), p(a)), sub(p(c), p(a)));
    const outward = add(add(n(a), n(b)), n(c));
    if (dot(facing, outward) < 0) this.indices.push(a, c, b);
    else this.indices.push(a, b, c);
  }
}

function buildMesh(poly: Polyhedron): DiceMeshData {
  const radius = ROUNDING[poly.shape];
  const atlas = atlasOf(poly.shape);
  const frames = faceFramesOf(poly.shape);
  const builder = new MeshBuilder();
  const plain = cellUv(atlas, atlas.plainCell, 0.5, 0.5);
  const inner = poly.vertices.map((_, corner) => innerCorner(poly, corner, radius));

  // The faces, each flat and set back from its edges by the rounding.
  poly.faces.forEach((face, index) => {
    const n = poly.normals[index];
    const frame = frames[index];
    const uvOf = (p: Vec3) => {
      const d = sub(p, frame.centre);
      return cellUv(
        atlas,
        index,
        0.5 + dot(d, frame.right) / (2 * frame.reach),
        0.5 + dot(d, frame.up) / (2 * frame.reach)
      );
    };
    const corners = face.map((corner) => add(inner[corner], scale(n, radius)));
    const middle = scale(
      corners.reduce<Vec3>((sum, v) => add(sum, v), [0, 0, 0]),
      1 / corners.length
    );
    const centre = builder.vertex(middle, n, uvOf(middle), frame.right);
    const ring = corners.map((p) => builder.vertex(p, n, uvOf(p), frame.right));
    ring.forEach((at, i) => builder.triangle(centre, at, ring[(i + 1) % ring.length]));
  });

  // The edges, each a strip of cylinder between the two faces that meet there.
  const done = new Set<string>();
  poly.faces.forEach((face, index) => {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (done.has(key)) return;
      done.add(key);
      const other = poly.faces.findIndex((f, j) => j !== index && f.includes(a) && f.includes(b));
      const from = poly.normals[index];
      const to = poly.normals[other];
      const along = normalize(sub(poly.vertices[b], poly.vertices[a]));
      let previous: [number, number] | null = null;
      for (let step = 0; step <= ARC_STEPS; step++) {
        const n = slerp(from, to, step / ARC_STEPS);
        const pair: [number, number] = [
          builder.vertex(add(inner[a], scale(n, radius)), n, plain, along),
          builder.vertex(add(inner[b], scale(n, radius)), n, plain, along),
        ];
        if (previous) {
          builder.triangle(previous[0], previous[1], pair[1]);
          builder.triangle(previous[0], pair[1], pair[0]);
        }
        previous = pair;
      }
    });
  });

  // The corners, each a patch of sphere among the faces that meet there.
  poly.vertices.forEach((_, corner) => {
    const around = aroundCorner(poly, corner);
    const middleNormal = normalize(around.reduce<Vec3>((sum, face) => add(sum, poly.normals[face]), [0, 0, 0]));
    const centre = builder.vertex(
      add(inner[corner], scale(middleNormal, radius)),
      middleNormal,
      plain,
      perpendicularTo(middleNormal)
    );
    around.forEach((face, i) => {
      const from = poly.normals[face];
      const to = poly.normals[around[(i + 1) % around.length]];
      let previous = -1;
      for (let step = 0; step <= ARC_STEPS; step++) {
        const n = slerp(from, to, step / ARC_STEPS);
        const at = builder.vertex(add(inner[corner], scale(n, radius)), n, plain, perpendicularTo(n));
        if (previous >= 0) builder.triangle(centre, previous, at);
        previous = at;
      }
    });
  });

  return {
    positions: new Float32Array(builder.positions),
    normals: new Float32Array(builder.normals),
    uvs: new Float32Array(builder.uvs),
    tangents: new Float32Array(builder.tangents),
    indices: new Uint32Array(builder.indices),
    atlas,
    frames,
  };
}

/**
 * The middle of the sphere that rounds a corner: the point as far inside each face that meets there
 * as the rounding is round. Found by least squares, which is exact where the faces meet evenly.
 */
function innerCorner(poly: Polyhedron, corner: number, radius: number): Vec3 {
  const faces = poly.faces.map((face, index) => ({ face, index })).filter(({ face }) => face.includes(corner));
  const rows = faces.map(({ index }) => poly.normals[index]);
  const targets = faces.map(({ face, index }) => dot(poly.normals[index], poly.vertices[face[0]]) - radius);
  // Normal equations: (AᵀA) c = Aᵀb.
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const r = [0, 0, 0];
  rows.forEach((n, i) => {
    for (let a = 0; a < 3; a++) {
      r[a] += n[a] * targets[i];
      for (let b = 0; b < 3; b++) m[a * 3 + b] += n[a] * n[b];
    }
  });
  return solve3(m, r);
}

/** The faces meeting at a corner, in turn about it. */
function aroundCorner(poly: Polyhedron, corner: number): number[] {
  const axis = normalize(poly.vertices[corner]);
  const faces = poly.faces.map((face, index) => ({ face, index })).filter(({ face }) => face.includes(corner));
  const u = normalize(sub(poly.normals[faces[0].index], scale(axis, dot(poly.normals[faces[0].index], axis))));
  const w = cross(axis, u);
  return faces
    .map(({ index }) => ({ index, angle: Math.atan2(dot(poly.normals[index], w), dot(poly.normals[index], u)) }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ index }) => index);
}

/** Some direction square to a normal, for the plain cell, where the texture is the same every way. */
function perpendicularTo(n: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(axis, n));
}

function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const cosine = Math.min(1, Math.max(-1, dot(a, b)));
  const angle = Math.acos(cosine);
  if (angle < 1e-6) return a;
  const s = Math.sin(angle);
  return normalize(add(scale(a, Math.sin((1 - t) * angle) / s), scale(b, Math.sin(t * angle) / s)));
}

function solve3(m: number[], r: number[]): Vec3 {
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const replaced = (column: number) => {
    const c = [...m];
    for (let row = 0; row < 3; row++) c[row * 3 + column] = r[row];
    return c[0] * (c[4] * c[8] - c[5] * c[7]) - c[1] * (c[3] * c[8] - c[5] * c[6]) + c[2] * (c[3] * c[7] - c[4] * c[6]);
  };
  return [replaced(0) / det, replaced(1) / det, replaced(2) / det];
}

/** A point in a face's cell, from 0 to 1 across and up it, as texture coordinates. */
export function cellUv(atlas: AtlasLayout, cell: number, across: number, up: number): [number, number] {
  const column = cell % atlas.columns;
  const row = Math.floor(cell / atlas.columns);
  return [(column + across) / atlas.columns, 1 - (row + 1 - up) / atlas.rows];
}
