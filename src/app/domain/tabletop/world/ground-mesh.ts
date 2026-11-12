import type { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_PAINT_FULL, GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';
import {
  hexCellCenter,
  hexCircumradius,
  hexCornerOffsets,
  hexSpacing,
  isFlatTopGrid,
  isHexGrid,
} from '@axe/domain/tabletop/hex-geometry';

/**
 * The board drawn over raised or sunk ground: its points on the board in table pixels (across, down
 * and up, three to a point), where the board's picture lies at each (across and up it, two to a
 * point), and the triangles between them, three points to a triangle.
 */
export interface GroundMesh {
  readonly points: Float32Array;
  readonly uvs: Float32Array;
  readonly triangles: Uint32Array;
  /**
   * How much of each kind of ground covers the board's picture at each point, four to a point in the
   * order of `GROUND_PAINT_LAYERS`, each out of one and no more than one together. Null where nothing
   * is painted.
   */
  readonly paint: Float32Array | null;
}

/**
 * The paint at every point of a mesh, read off the sample nearest each, or null where nothing is
 * painted anywhere. A sample whose shares come to more than full is read as full, in the same
 * proportions.
 */
function paintOf(points: Float32Array, ground: GroundSurface, gridSize: number): Float32Array | null {
  const count = points.length / 3;
  const paint = new Float32Array(count * 4);
  let painted = false;
  for (let point = 0; point < count; point++) {
    const shares = ground.paintAt(
      Math.round((points[point * 3] / gridSize) * GROUND_SAMPLES_PER_CELL),
      Math.round((points[point * 3 + 1] / gridSize) * GROUND_SAMPLES_PER_CELL)
    );
    if (!shares) continue;
    const total = shares.reduce((sum, share) => sum + share, 0);
    if (total <= 0) continue;
    painted = true;
    const out = Math.max(total, GROUND_PAINT_FULL);
    paint.set(
      Array.from(shares, (share) => share / out),
      point * 4
    );
  }
  return painted ? paint : null;
}

/** A box of the board, in table pixels. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The corners of a hex cell, in table pixels. */
type Hex = readonly { readonly x: number; readonly y: number }[];

/** How many smaller triangles a side of a hex's triangle is split into, to follow the ground over it. */
const HEX_SPLITS = 4;

/** The places a box is sampled at along one side: a sample every half cell from the board's edge, and its far edge. */
function samplesAlong(from: number, length: number, step: number): number[] {
  const at: number[] = [];
  for (let offset = Math.ceil(from / step) * step; offset < from + length; offset += step) at.push(offset);
  if (at[0] !== from) at.unshift(from);
  at.push(from + length);
  return at;
}

/**
 * The square board's box over the ground, a point on every sample of the ground in it and along its
 * edges, each square of four split from its top left to its bottom right as the ground is read, so a
 * piece stands on the ground the reader sees.
 */
export function squareGroundMesh(box: Box, ground: GroundSurface, gridSize: number): GroundMesh {
  const mesh = squareMesh(box, ground, gridSize);
  return { ...mesh, paint: paintOf(mesh.points, ground, gridSize) };
}

/** The mesh of {@link squareGroundMesh}, unpainted. */
function squareMesh(box: Box, ground: GroundSurface, gridSize: number): GroundMesh {
  const step = gridSize / GROUND_SAMPLES_PER_CELL;
  const across = samplesAlong(box.x, box.width, step);
  const down = samplesAlong(box.y, box.height, step);
  const points = new Float32Array(across.length * down.length * 3);
  const uvs = new Float32Array(across.length * down.length * 2);
  down.forEach((y, j) =>
    across.forEach((x, i) => {
      const at = j * across.length + i;
      points.set([x, y, ground.heightAt(x / gridSize, y / gridSize) * gridSize], at * 3);
      uvs.set([(x - box.x) / box.width, 1 - (y - box.y) / box.height], at * 2);
    })
  );
  const triangles = new Uint32Array((across.length - 1) * (down.length - 1) * 6);
  let written = 0;
  for (let j = 0; j < down.length - 1; j++) {
    for (let i = 0; i < across.length - 1; i++) {
      const topLeft = j * across.length + i;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + across.length;
      const bottomRight = bottomLeft + 1;
      triangles.set([topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft], written);
      written += 6;
    }
  }
  return { points, uvs, triangles, paint: null };
}

/**
 * A hex board's cells over the ground: each cell's outline kept, its triangles split smaller and each
 * point raised to the ground under it.
 */
export function hexGroundMesh(hexes: readonly Hex[], box: Box, ground: GroundSurface, gridSize: number): GroundMesh {
  const mesh = hexMesh(hexes, box, ground, gridSize);
  return { ...mesh, paint: paintOf(mesh.points, ground, gridSize) };
}

/** The mesh of {@link hexGroundMesh}, unpainted. */
function hexMesh(hexes: readonly Hex[], box: Box, ground: GroundSurface, gridSize: number): GroundMesh {
  const points: number[] = [];
  const uvs: number[] = [];
  const triangles: number[] = [];
  const point = (x: number, y: number): number => {
    points.push(x, y, ground.heightAt(x / gridSize, y / gridSize) * gridSize);
    uvs.push((x - box.x) / box.width, 1 - (y - box.y) / box.height);
    return points.length / 3 - 1;
  };
  for (const hex of hexes) {
    for (let k = 1; k < hex.length - 1; k++) {
      const [a, b, c] = [hex[0], hex[k], hex[k + 1]];
      const row: number[][] = [];
      for (let u = 0; u <= HEX_SPLITS; u++) {
        row.push([]);
        for (let v = 0; v <= HEX_SPLITS - u; v++) {
          const w = HEX_SPLITS - u - v;
          row[u].push(point((a.x * w + b.x * u + c.x * v) / HEX_SPLITS, (a.y * w + b.y * u + c.y * v) / HEX_SPLITS));
        }
      }
      for (let u = 0; u < HEX_SPLITS; u++) {
        for (let v = 0; v < HEX_SPLITS - u; v++) {
          triangles.push(row[u][v], row[u + 1][v], row[u][v + 1]);
          if (v < HEX_SPLITS - u - 1) triangles.push(row[u + 1][v], row[u + 1][v + 1], row[u][v + 1]);
        }
      }
    }
  }
  return {
    points: new Float32Array(points),
    uvs: new Float32Array(uvs),
    triangles: new Uint32Array(triangles),
    paint: null,
  };
}

/**
 * The ground's mesh over a box of the floor, on the board and off it alike, cut to the box and
 * unpainted: what a sheet lying over the ground is laid on, as a range is. On a square table it is
 * the squares of the samples the box reaches, laid as the board's are, so it lies on the board's
 * ground exactly; on a hex table the cells the box reaches, each at its own size rather than a little
 * larger as the board's are, so that none of it lies over another part of it.
 */
export function groundMeshOver(box: Box, ground: GroundSurface, gridSize: number, gridType: GridType): GroundMesh {
  if (isHexGrid(gridType)) return cutToBox(hexMesh(hexesOver(box, gridSize, gridType), box, ground, gridSize), box);
  const step = gridSize / GROUND_SAMPLES_PER_CELL;
  const left = Math.floor(box.x / step) * step;
  const top = Math.floor(box.y / step) * step;
  const right = Math.max(left + step, Math.ceil((box.x + box.width) / step) * step);
  const bottom = Math.max(top + step, Math.ceil((box.y + box.height) / step) * step);
  return cutToBox(squareMesh({ x: left, y: top, width: right - left, height: bottom - top }, ground, gridSize), box);
}

/** The cells of a hex table's grid a box reaches, on the board or off it, each at its own size. */
function hexesOver(box: Box, gridSize: number, gridType: GridType): Hex[] {
  const isFlatTop = isFlatTopGrid(gridType);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const corners = hexCornerOffsets(hexCircumradius(gridSize), isFlatTop);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const hexes: Hex[] = [];
  for (let col = Math.floor(box.x / colSpacing) - 2; col <= Math.ceil(right / colSpacing) + 2; col++) {
    for (let row = Math.floor(box.y / rowSpacing) - 2; row <= Math.ceil(bottom / rowSpacing) + 2; row++) {
      const middle = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const hex = corners.map((corner) => ({ x: middle.x + corner.x, y: middle.y + corner.y }));
      const xs = hex.map((corner) => corner.x);
      const ys = hex.map((corner) => corner.y);
      if (Math.max(...xs) <= box.x || Math.min(...xs) >= right) continue;
      if (Math.max(...ys) <= box.y || Math.min(...ys) >= bottom) continue;
      hexes.push(hex);
    }
  }
  return hexes;
}

/** A point of a mesh: across, down and up, in table pixels. */
type MeshPoint = readonly [number, number, number];

/**
 * A mesh cut to a box: its triangles inside it kept, those across its edges cut along them, as flat
 * as they were, and those outside it left out, with the box's picture laid over it.
 */
function cutToBox(mesh: GroundMesh, box: Box): GroundMesh {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const kept = new Int32Array(mesh.points.length / 3).fill(-1);
  const points: number[] = [];
  const triangles: number[] = [];
  const pointAt = (at: number): MeshPoint => [mesh.points[at * 3], mesh.points[at * 3 + 1], mesh.points[at * 3 + 2]];
  const add = (point: MeshPoint): number => {
    points.push(...point);
    return points.length / 3 - 1;
  };
  const keep = (at: number): number => {
    if (kept[at] < 0) kept[at] = add(pointAt(at));
    return kept[at];
  };
  for (let at = 0; at + 2 < mesh.triangles.length; at += 3) {
    const corners = [mesh.triangles[at], mesh.triangles[at + 1], mesh.triangles[at + 2]];
    const triangle = corners.map(pointAt);
    const xs = triangle.map((point) => point[0]);
    const ys = triangle.map((point) => point[1]);
    if (Math.max(...xs) <= box.x || Math.min(...xs) >= right || Math.max(...ys) <= box.y || Math.min(...ys) >= bottom) {
      continue;
    }
    if (Math.min(...xs) >= box.x && Math.max(...xs) <= right && Math.min(...ys) >= box.y && Math.max(...ys) <= bottom) {
      triangles.push(...corners.map(keep));
      continue;
    }
    const cut = clipAlong(
      clipAlong(clipAlong(clipAlong(triangle, 0, box.x, 1), 0, right, -1), 1, box.y, 1),
      1,
      bottom,
      -1
    );
    if (cut.length < 3) continue;
    const first = add(cut[0]);
    let previous = add(cut[1]);
    for (let k = 2; k < cut.length; k++) {
      const next = add(cut[k]);
      triangles.push(first, previous, next);
      previous = next;
    }
  }
  const uvs = new Float32Array((points.length / 3) * 2);
  for (let at = 0; at < points.length / 3; at++) {
    uvs.set([(points[at * 3] - box.x) / box.width, 1 - (points[at * 3 + 1] - box.y) / box.height], at * 2);
  }
  return { points: new Float32Array(points), uvs, triangles: new Uint32Array(triangles), paint: null };
}

/**
 * What of a flat polygon lies on one side of a line across or down the floor: where `axis` (0 across,
 * 1 down) is at least `at` for a `side` of 1, or at most it for -1.
 */
function clipAlong(polygon: readonly MeshPoint[], axis: 0 | 1, at: number, side: 1 | -1): MeshPoint[] {
  const out: MeshPoint[] = [];
  for (let k = 0; k < polygon.length; k++) {
    const from = polygon[k];
    const to = polygon[(k + 1) % polygon.length];
    const fromIn = side * (from[axis] - at) >= 0;
    const toIn = side * (to[axis] - at) >= 0;
    if (fromIn) out.push(from);
    if (fromIn === toIn) continue;
    const t = (at - from[axis]) / (to[axis] - from[axis]);
    out.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
  }
  return out;
}
