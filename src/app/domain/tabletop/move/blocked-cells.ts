import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';

/**
 * Whether a terrain piece stands in the way of a piece walking: a block on the floor with walls or a face too
 * sheer to climb.
 *
 * An open door lets pieces through, and terrain that is not on the floor never blocks.
 */
export function terrainBlocksMovement(terrain: Terrain): boolean {
  if (surfaceOf(terrain) !== 'floor') return false;
  if (!terrain.hasWall && !terrain.blocksClimb) return false;
  return !(terrain.isDoor && terrain.isDoorOpen);
}

/**
 * What still stands in the way of a piece that means to jump.
 *
 * Height is no answer to a piece that can leave the ground, so a block it could get on top of
 * is somewhere to land rather than something to walk around. A face too sheer to climb is the
 * one thing a jump does not answer.
 */
export function terrainBlocksJump(terrain: Terrain): boolean {
  if (surfaceOf(terrain) !== 'floor') return false;
  if (!terrain.blocksClimb) return false;
  return !(terrain.isDoor && terrain.isDoorOpen);
}

/**
 * The cells covered by terrain that stops a piece, judged by `stops`: walking by default, or
 * {@link terrainBlocksJump} for a piece that jumps.
 *
 * Empty for a grid with no cell size.
 */
export function blockedByTerrain(
  grid: CellGrid,
  terrains: readonly Terrain[],
  stops: (terrain: Terrain) => boolean = terrainBlocksMovement
): CellBits {
  const bits = new CellBits(cellCount(grid));
  if (grid.sizePx <= 0) return bits;
  for (const terrain of terrains) {
    if (!stops(terrain)) continue;
    const box = terrainBoxOf(terrain, grid.sizePx);
    forEachCellInBox(grid, box.minX, box.minY, box.maxX, box.maxY, (cell) => bits.set(cell));
  }
  return bits;
}
