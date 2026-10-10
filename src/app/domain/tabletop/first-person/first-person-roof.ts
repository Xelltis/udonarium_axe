import { FirstPersonWorld } from '@axe/domain/tabletop/first-person/first-person-world';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, cellCount, CellGrid, forEachNeighbourCell } from '@axe/domain/tabletop/fog/cell-grid';
import { blockedByTerrain } from '@axe/domain/tabletop/move/blocked-cells';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

/** Where the first-person view is roofed over, and how high. */
export interface FirstPersonRoof {
  /** The cells under the roof. */
  readonly cells: CellBits;
  /** The height of the roof, in table pixels. */
  readonly heightPx: number;
}

/**
 * The cells that walls shut in: every cell that cannot be reached from the edge of the board
 * without crossing a walled cell, the walls round them included. Ground open to the edge is out
 * under the sky, however many walls stand on it.
 */
export function enclosedCells(grid: CellGrid, walled: CellBits): CellBits {
  const count = cellCount(grid);
  const outside = new CellBits(count);
  const queue: number[] = [];
  for (let cell = 0; cell < count; cell++) {
    if (walled.get(cell)) continue;
    const { col, row } = cellColRow(grid, cell);
    if (col !== 0 && row !== 0 && col !== grid.cols - 1 && row !== grid.rows - 1) continue;
    outside.set(cell);
    queue.push(cell);
  }
  for (let next = 0; next < queue.length; next++) {
    forEachNeighbourCell(grid, queue[next], (neighbour) => {
      if (outside.get(neighbour) || walled.get(neighbour)) return;
      outside.set(neighbour);
      queue.push(neighbour);
    });
  }
  const enclosed = new CellBits(count);
  for (let cell = 0; cell < count; cell++) {
    if (!outside.get(cell)) enclosed.set(cell);
  }
  return enclosed;
}

/**
 * The roof over the ground the board's walls and doors shut in, at the height of the tallest wall
 * on the board, or none where nothing is shut in or there is no wall to rest a roof on.
 *
 * It is worked out from the board alone, not from what the eye happens to see, so turning to face a
 * tower out in the open does not put a roof over the field, and the roof does not rise and fall as
 * the eye turns. A door counts as a wall whether it stands open or shut.
 */
export function firstPersonRoofOf(
  grid: CellGrid,
  terrains: readonly Terrain[],
  world: FirstPersonWorld
): FirstPersonRoof | null {
  const heightPx = world.walls.reduce((top, wall) => (wall.terrain ? Math.max(top, wall.topPx) : top), 0);
  if (heightPx <= 0) return null;
  const walled = blockedByTerrain(
    grid,
    terrains,
    (terrain) => surfaceOf(terrain) === 'floor' && (terrain.hasWall || terrain.isDoor)
  );
  const cells = enclosedCells(grid, walled);
  return cells.isEmpty ? null : { cells, heightPx };
}
