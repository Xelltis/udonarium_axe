import { GROUND_PAINT_FULL, GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';

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
   * The paint at each point, four to a point: its colour, in sRGB, and how much of it covers the
   * board's picture there. Null where nothing is painted.
   */
  readonly paint: Float32Array | null;
}

/** The colour each kind of ground is painted in, in sRGB, in the order of `GROUND_PAINT_LAYERS`. */
const PAINT_COLOURS: readonly (readonly [number, number, number])[] = [
  [0.36, 0.54, 0.23],
  [0.48, 0.35, 0.23],
  [0.5, 0.5, 0.5],
  [0.85, 0.76, 0.55],
];

/** How much of the board's picture the fullest paint covers. */
const PAINT_COVER = 0.85;

/**
 * The paint at every point of a mesh, read off the sample nearest each, or null where nothing is
 * painted anywhere.
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
    let total = 0;
    const colour = [0, 0, 0];
    shares.forEach((share, layer) => {
      total += share;
      for (let channel = 0; channel < 3; channel++) colour[channel] += PAINT_COLOURS[layer][channel] * share;
    });
    if (total <= 0) continue;
    painted = true;
    paint.set(
      [...colour.map((value) => value / total), Math.min(1, total / GROUND_PAINT_FULL) * PAINT_COVER],
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
  const step = gridSize / 2;
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
  return { points, uvs, triangles, paint: paintOf(points, ground, gridSize) };
}

/**
 * A hex board's cells over the ground: each cell's outline kept, its triangles split smaller and each
 * point raised to the ground under it.
 */
export function hexGroundMesh(
  hexes: readonly (readonly { readonly x: number; readonly y: number }[])[],
  box: Box,
  ground: GroundSurface,
  gridSize: number
): GroundMesh {
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
  const laid = new Float32Array(points);
  return {
    points: laid,
    uvs: new Float32Array(uvs),
    triangles: new Uint32Array(triangles),
    paint: paintOf(laid, ground, gridSize),
  };
}
