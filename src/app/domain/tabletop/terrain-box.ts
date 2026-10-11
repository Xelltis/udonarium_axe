import { rectangleSegments } from '@axe/domain/tabletop/los/segments';
import { Terrain } from '@axe/domain/tabletop/terrain';

export interface TerrainBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The ground a block stands on, squared up to the table.
 *
 * A block turned off the square covers a corner of every cell it leans over, so the box that
 * holds it is wider than the block. What is asked of this is which cells to look at, and a
 * cell too many is answered for rather than missed.
 */
export function terrainBoxOf(terrain: Terrain, gridSize: number): TerrainBox {
  const edges = rectangleSegments(
    terrain.location.x,
    terrain.location.y,
    terrain.width * gridSize,
    terrain.depth * gridSize,
    terrain.rotate
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const edge of edges) {
    minX = Math.min(minX, edge.x1, edge.x2);
    minY = Math.min(minY, edge.y1, edge.y2);
    maxX = Math.max(maxX, edge.x1, edge.x2);
    maxY = Math.max(maxY, edge.y1, edge.y2);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * How far a point may stand off a turned box's side and still count as on it.
 *
 * A quarter turn is not quite a quarter turn in floating point, and a side that falls on a
 * whole pixel would otherwise land either side of it by a hair.
 */
const TURN_SLACK_PX = 1e-6;

/**
 * A point of the table, turned back about a middle by a box's own turn, so it can be held
 * against the sides the box had before it was turned.
 *
 * The turn is in degrees, clockwise on the table as a block is turned.
 */
export function unturnedPoint(
  middleX: number,
  middleY: number,
  rotateDeg: number,
  x: number,
  y: number
): { x: number; y: number } {
  if (!rotateDeg) return { x, y };
  const turn = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const fromMiddleX = x - middleX;
  const fromMiddleY = y - middleY;
  return {
    x: middleX + fromMiddleX * cos + fromMiddleY * sin,
    y: middleY - fromMiddleX * sin + fromMiddleY * cos,
  };
}

/**
 * Whether a point lies inside a box that has been turned about its middle, sides included.
 *
 * The box is given as it stood before the turn.
 */
export function turnedBoxCovers(box: TerrainBox, rotateDeg: number, x: number, y: number): boolean {
  const point = unturnedPoint((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, rotateDeg, x, y);
  return (
    point.x >= box.minX - TURN_SLACK_PX &&
    point.x <= box.maxX + TURN_SLACK_PX &&
    point.y >= box.minY - TURN_SLACK_PX &&
    point.y <= box.maxY + TURN_SLACK_PX
  );
}

/**
 * Whether a point of the table lies on the ground a block stands on, turned as the block is.
 *
 * Unlike {@link terrainBoxOf}, a block turned off the square does not cover the corners of the
 * box that holds it.
 */
export function terrainCovers(terrain: Terrain, gridSize: number, x: number, y: number): boolean {
  const left = terrain.location.x;
  const top = terrain.location.y;
  const box = { minX: left, minY: top, maxX: left + terrain.width * gridSize, maxY: top + terrain.depth * gridSize };
  return turnedBoxCovers(box, terrain.rotate, x, y);
}
