import type { GroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import type {
  TableWorldBoard,
  TableWorldBoardShape,
  TableWorldCap,
  TableWorldWall,
} from '@axe/domain/tabletop/world/table-world';
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  ShapeUtils,
  Vector2,
} from 'three/webgpu';

/**
 * The board's face, lying on the floor: its whole box on a square board, and each of its cells on a
 * hex board, with the picture's box read off across it.
 */
export function boardGeometry(board: TableWorldBoard): BufferGeometry {
  const { box, hexes } = board.shape;
  if (!hexes) {
    const plane = new PlaneGeometry(box.width, box.height);
    plane.rotateX(-Math.PI / 2);
    plane.translate(box.x + box.width / 2, 0, box.y + box.height / 2);
    return plane;
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const corner = (point: { x: number; y: number }) => {
    positions.push(point.x, 0, point.y);
    uvs.push((point.x - box.x) / box.width, 1 - (point.y - box.y) / box.height);
  };
  for (const hex of hexes) {
    for (let i = 1; i < hex.length - 1; i++) {
      corner(hex[0]);
      corner(hex[i]);
      corner(hex[i + 1]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * The board laid over raised and sunk ground: each point of the mesh at its height over the board,
 * the board's picture stretched over it as over the flat board.
 */
export function groundGeometry(ground: GroundMesh): BufferGeometry {
  const geometry = overGround(ground, 0, null);
  if (ground.paint) geometry.setAttribute('paint', new Float32BufferAttribute(ground.paint, 4));
  return geometry;
}

/**
 * The same mesh lifted a little off the ground, with a picture laid over the box given rather than
 * the board's: as the grid, drawn over the ground it follows, or a range, over the ground's mesh cut
 * to its box.
 */
export function gridOverGround(
  ground: GroundMesh,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  liftPx: number
): BufferGeometry {
  return overGround(ground, liftPx, box);
}

function overGround(
  ground: GroundMesh,
  liftPx: number,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null
): BufferGeometry {
  const count = ground.points.length / 3;
  const positions = new Float32Array(count * 3);
  const uvs = box ? new Float32Array(count * 2) : ground.uvs;
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [ground.points[i * 3], ground.points[i * 3 + 1], ground.points[i * 3 + 2]];
    positions.set([x, z + liftPx, y], i * 3);
    if (box) uvs.set([(x - box.x) / box.width, 1 - (y - box.y) / box.height], i * 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(ground.triangles, 1));
  return geometry;
}

/**
 * An upright face between two points of the floor, from its foot to its top, or to the heights a
 * slope over it folds through. A tiled picture runs along it a tile at a time, measured from its
 * first point and its foot; any other is stretched over the whole face, up to its highest point.
 */
export function wallGeometry(wall: TableWorldWall): BufferGeometry {
  const length = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay);
  const stops = wall.profile?.length
    ? wall.profile
    : [
        { at: 0, heightPx: wall.topPx },
        { at: 1, heightPx: wall.topPx },
      ];
  const highest = Math.max(...stops.map((stop) => stop.heightPx));
  const across = (at: number) => {
    if (wall.uFrom !== undefined && wall.uTo !== undefined) return wall.uFrom + (wall.uTo - wall.uFrom) * at;
    return wall.tilePx > 0 ? (length * at) / wall.tilePx : at;
  };
  const up = (height: number) =>
    wall.tilePx > 0 ? (height - wall.basePx) / wall.tilePx : (height - wall.basePx) / (highest - wall.basePx || 1);
  const positions: number[] = [];
  const uvs: number[] = [];
  const turned = wall.profile?.length ? undefined : wall.uvs;
  const corner = (at: number, height: number) => {
    positions.push(wall.ax + (wall.bx - wall.ax) * at, height, wall.ay + (wall.by - wall.ay) * at);
    if (!turned) {
      uvs.push(across(at), up(height));
      return;
    }
    const placed = turned[at === 0 ? (height === wall.basePx ? 0 : 3) : height === wall.basePx ? 1 : 2];
    uvs.push(placed.x, placed.y);
  };
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    corner(from.at, wall.basePx);
    corner(to.at, wall.basePx);
    corner(to.at, to.heightPx);
    corner(from.at, wall.basePx);
    corner(to.at, to.heightPx);
    corner(from.at, from.heightPx);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * A flat face of a block, its outline cut into triangles at its height. A tiled picture is laid
 * from the board's corner a tile at a time; any other is stretched over the outline's box.
 */
export function capGeometry(cap: TableWorldCap): BufferGeometry {
  const contour = cap.outline.map((point) => new Vector2(point.x, point.y));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const xs = cap.outline.map((point) => point.x);
  const ys = cap.outline.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX || 1;
  const depth = Math.max(...ys) - minY || 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const triangle of triangles) {
    for (const index of triangle) {
      const point = cap.outline[index];
      positions.push(point.x, cap.heights?.[index] ?? cap.zPx, point.y);
      if (cap.uvs) uvs.push(cap.uvs[index].x, cap.uvs[index].y);
      else if (cap.tilePx > 0) uvs.push(point.x / cap.tilePx, -point.y / cap.tilePx);
      else uvs.push((point.x - minX) / width, 1 - (point.y - minY) / depth);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** Faces built apart, as one shape: their corners and the places of their pictures, one after another. */
export function mergedFaces(shapes: readonly BufferGeometry[]): BufferGeometry {
  const joined = (name: 'position' | 'uv') => {
    const parts = shapes.map((shape) => shape.getAttribute(name).array as Float32Array);
    const all = new Float32Array(parts.reduce((length, part) => length + part.length, 0));
    let at = 0;
    for (const part of parts) {
      all.set(part, at);
      at += part.length;
    }
    return all;
  };
  const merged = new BufferGeometry();
  merged.setAttribute('position', new Float32BufferAttribute(joined('position'), 3));
  merged.setAttribute('uv', new Float32BufferAttribute(joined('uv'), 2));
  return merged;
}

/**
 * The tops that wear the table's grid, lifted a hair above themselves, with the grid's canvas read
 * off at each point of the board, so the grid on a block lines up with the grid on the board.
 */
export function griddedTops(
  caps: readonly TableWorldCap[],
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  liftPx: number
): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const cap of caps) {
    const contour = cap.outline.map((point) => new Vector2(point.x, point.y));
    for (const triangle of ShapeUtils.triangulateShape(contour, [])) {
      for (const index of triangle) {
        const point = cap.outline[index];
        positions.push(point.x, (cap.heights?.[index] ?? cap.zPx) + liftPx, point.y);
        uvs.push((point.x - box.x) / box.width, 1 - (point.y - box.y) / box.height);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * The table's grid laid over the board a hair above it: over its box on a square board, and cut to
 * the board's cells on a hex board as the page cuts it, with the grid's canvas read off across its
 * own box.
 */
export function gridOverBoard(
  hexes: TableWorldBoardShape['hexes'],
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  liftPx: number
): BufferGeometry {
  if (!hexes) {
    const plane = new PlaneGeometry(box.width, box.height);
    plane.rotateX(-Math.PI / 2);
    plane.translate(box.x + box.width / 2, liftPx, box.y + box.height / 2);
    return plane;
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const corner = (point: { x: number; y: number }) => {
    positions.push(point.x, liftPx, point.y);
    uvs.push((point.x - box.x) / box.width, 1 - (point.y - box.y) / box.height);
  };
  for (const hex of hexes) {
    for (let i = 1; i < hex.length - 1; i++) {
      corner(hex[0]);
      corner(hex[i]);
      corner(hex[i + 1]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}
