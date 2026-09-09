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
