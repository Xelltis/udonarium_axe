import { cellCount, CellGrid, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
import { SurfaceLean, terrainLeanAt, terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';

/** Whether a block is something a piece walked at ends up standing on top of. */
function canBeStoodOn(terrain: Terrain): boolean {
  if (surfaceOf(terrain) !== 'floor') return false;
  if (terrain.blocksClimb) return false;
  return !(terrain.isDoor && terrain.isDoorOpen);
}

/**
 * How high the ground stands at a point on the table.
 *
 * The floor unless something is standing there to be stood on. A face too sheer to climb is
 * not: a piece that cannot get up it cannot be put down on top of it either.
 *
 * A sloping block is read where it is walked on, so a piece climbs a ramp along it rather than
 * stepping up to the height of its far end.
 */
export function landingHeightAt(
  terrains: readonly Terrain[],
  gridSize: number,
  x: number,
  y: number,
  gridType: GridType = GridType.SQUARE
): number {
  let highest = 0;
  for (const terrain of terrains) {
    if (!canBeStoodOn(terrain)) continue;
    const box = terrainBoxOf(terrain, gridSize);
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue;
    const top = terrainTopPxAt(terrain, gridSize, gridType, x, y);
    if (top > highest) highest = top;
  }
  return highest;
}

/**
 * How high the ground stands in every cell of the grid, read at the middle of each cell.
 *
 * The same answer {@link landingHeightAt} gives, for the whole board at once: a piece walks
 * cell by cell and is put down in the middle of each, so that is where the ground under it is
 * read. The floor reads as nothing, and cells with no cell size to speak of read as floor.
 */
export function landingHeightsOn(grid: CellGrid, terrains: readonly Terrain[]): Float64Array {
  const heights = new Float64Array(cellCount(grid));
  if (grid.sizePx <= 0) return heights;
  for (const terrain of terrains) {
    if (!canBeStoodOn(terrain)) continue;
    const box = terrainBoxOf(terrain, grid.sizePx);
    forEachCellInBox(grid, box.minX, box.minY, box.maxX, box.maxY, (cell, cx, cy) => {
      const top = terrainTopPxAt(terrain, grid.sizePx, grid.type, cx, cy);
      if (top > heights[cell]) heights[cell] = top;
    });
  }
  return heights;
}

/**
 * How close two heights have to be to count as one and the same ground.
 *
 * Blocks of a height are built to the same numbers and come out level to the last bit, so this
 * only covers the rounding a turned or sloping block brings with it.
 */
export const LEVEL_TOLERANCE_PX = 0.5;

/** Whether two heights are the same ground to walk along, rather than a step up or down. */
export function isLevelWith(heightPx: number, otherPx: number): boolean {
  return Math.abs(heightPx - otherPx) < LEVEL_TOLERANCE_PX;
}

/**
 * Whether the ground at one height is a step from the ground at another, rather than a climb.
 *
 * A cell is what a piece can get up or down without making anything of it. Higher than that
 * and the ground is a wall to whoever is below it, and a drop to whoever is on top.
 */
export function isWalkableStep(heightPx: number, fromPx: number, gridSize: number): boolean {
  return Math.abs(heightPx - fromPx) <= gridSize + LEVEL_TOLERANCE_PX;
}

/**
 * Which way the ground leans at a point on the table, or nothing where it is level.
 *
 * The lean of whatever a piece would be standing on there: the highest thing it could be put
 * down on, read where it stands rather than at that thing's highest corner.
 */
export function landingLeanAt(
  terrains: readonly Terrain[],
  gridSize: number,
  x: number,
  y: number,
  gridType: GridType = GridType.SQUARE
): SurfaceLean | null {
  let highest = 0;
  let leaning: SurfaceLean | null = null;
  for (const terrain of terrains) {
    if (!canBeStoodOn(terrain)) continue;
    const box = terrainBoxOf(terrain, gridSize);
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue;
    const top = terrainTopPxAt(terrain, gridSize, gridType, x, y);
    if (top < highest) continue;
    highest = top;
    leaning = terrainLeanAt(terrain, gridSize, gridType, x, y);
  }
  return leaning;
}

/**
 * How high a piece is, part way through a hop from one height to another.
 *
 * Read at a fraction of the way across. The rise is walked evenly and an arch is laid over
 * it, so the piece leaves the ground before the face it is getting over and comes down on the
 * far side of it rather than climbing the wall on the way past.
 */
export function hopHeightAt(progress: number, fromZ: number, toZ: number, liftPx: number): number {
  const along = Math.min(1, Math.max(0, progress));
  const arch = 4 * along * (1 - along);
  return fromZ + (toZ - fromZ) * along + liftPx * arch;
}

/**
 * How high a piece throws itself to clear the face it is getting over.
 *
 * Enough that it is over the ledge before it is above it, or the piece would be drawn walking
 * up through the wall and stepping out at the top. Going down wants no such throw: a piece
 * leaving a ledge steps off it and falls.
 */
export function hopLiftFor(fromZ: number, toZ: number, gridSize: number): number {
  return Math.max(gridSize * 0.3, Math.max(0, toZ - fromZ) * 0.8);
}
