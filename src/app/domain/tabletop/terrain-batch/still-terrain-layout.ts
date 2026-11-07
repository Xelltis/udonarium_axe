import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { isBatchable } from '@axe/domain/tabletop/terrain-batch/batchable';
import { blockFootprintOf } from '@axe/domain/tabletop/terrain-footprint';

/** A block on the table, with what decides whether it is drawn together with others. */
export interface StillTerrainInput {
  readonly terrain: Terrain;
  /** Whether the fog leaves the whole block drawn for whoever is looking. */
  readonly shownWhole: boolean;
  /** Whether it is in the selection, and so drawn alone to be shown as selected. */
  readonly selected: boolean;
}

/** How many cells a hex flower of this many cells across covers. */
function flowerCellCount(size: number): number {
  return 3 * size * (size - 1) + 1;
}

/**
 * The identifiers of the blocks that do not move which are drawn together, and not alone as well. A
 * block is drawn together with others when {@link isBatchable} allows it, it is not selected, the
 * fog leaves all of it drawn and every cell it covers is on the board and its own.
 */
export function stillBlocksDrawnTogether(inputs: readonly StillTerrainInput[], grid: CellGrid): ReadonlySet<string> {
  const hex = isHexGrid(grid.type);
  const candidates: { terrain: Terrain; cells: readonly number[] }[] = [];
  for (const { terrain, shownWhole, selected } of inputs) {
    if (selected || !shownWhole || !isBatchable(terrain, grid)) continue;
    const cells = blockFootprintOf(terrain, grid);
    if (!cells) continue;
    const expected = hex ? flowerCellCount(terrain.width) : terrain.width * terrain.depth;
    if (cells.length !== expected) continue;
    candidates.push({ terrain, cells });
  }
  const claims = new Map<number, number>();
  for (const { cells } of candidates) {
    for (const cell of cells) claims.set(cell, (claims.get(cell) ?? 0) + 1);
  }
  const chosen = candidates.filter(({ cells }) => cells.every((cell) => claims.get(cell) === 1));
  return new Set(chosen.map(({ terrain }) => terrain.identifier));
}
