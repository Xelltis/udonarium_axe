import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { isBatchable } from '@axe/domain/tabletop/terrain-batch/batchable';
import { OcclusionShape, occlusionShapeOf } from '@axe/domain/tabletop/terrain-occlusion/occlusion-shape';

/** A block on the table, with what decides whether it is drawn together with others. */
export interface StillTerrainInput {
  readonly terrain: Terrain;
  /** Whether the fog leaves the whole block drawn for whoever is looking. */
  readonly shownWhole: boolean;
  /** Whether it is in the selection, and so drawn alone to be shown as selected. */
  readonly selected: boolean;
}

/** How the blocks that do not move are drawn together. */
export interface StillTerrainLayout {
  /** The identifiers of the blocks drawn together, which are not to be drawn alone as well. */
  readonly merged: ReadonlySet<string>;
}

/** How many cells a hex flower of this many cells across covers. */
function flowerCellCount(size: number): number {
  return 3 * size * (size - 1) + 1;
}

/**
 * Works out which blocks are drawn together. A block is drawn together with others when
 * {@link isBatchable} allows it, it is not selected, the fog leaves all of it drawn and every cell
 * it covers is on the board and its own.
 */
export function stillTerrainLayoutOf(inputs: readonly StillTerrainInput[], grid: CellGrid): StillTerrainLayout {
  const hex = isHexGrid(grid.type);
  const candidates: { terrain: Terrain; shape: OcclusionShape }[] = [];
  for (const { terrain, shownWhole, selected } of inputs) {
    if (selected || !shownWhole || !isBatchable(terrain, grid)) continue;
    const shape = occlusionShapeOf(terrain, grid, shownWhole);
    if (!shape) continue;
    const expected = hex ? flowerCellCount(terrain.width) : terrain.width * terrain.depth;
    if (shape.cells.length !== expected) continue;
    candidates.push({ terrain, shape });
  }
  const claims = new Map<number, number>();
  for (const { shape } of candidates) {
    for (const cell of shape.cells) claims.set(cell, (claims.get(cell) ?? 0) + 1);
  }
  const chosen = candidates.filter(({ shape }) => shape.cells.every((cell) => claims.get(cell) === 1));
  return { merged: new Set(chosen.map(({ terrain }) => terrain.identifier)) };
}
