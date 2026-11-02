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
  return { points, uvs, triangles };
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
  return { points: new Float32Array(points), uvs: new Float32Array(uvs), triangles: new Uint32Array(triangles) };
}
