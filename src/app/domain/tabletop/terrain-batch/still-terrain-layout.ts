import { cellColRow, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { isBatchable } from '@axe/domain/tabletop/terrain-batch/batchable';
import { HexCapSheet, hexCapSheetsOf } from '@axe/domain/tabletop/terrain-batch/hex-caps';
import { SquareCap, squareCapsOf } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { SquareWall, squareWallOf } from '@axe/domain/tabletop/terrain-batch/square-walls';
import { hiddenFacesByTerrain, hiddenFacesOf } from '@axe/domain/tabletop/terrain-occlusion/hidden-faces';
import { OcclusionShape, occlusionShapeOf } from '@axe/domain/tabletop/terrain-occlusion/occlusion-shape';
import { BlockSide } from '@axe/domain/tabletop/terrain-shade';

/** A block on the table, with what decides whether it is drawn together with others. */
export interface StillTerrainInput {
  readonly terrain: Terrain;
  /** Whether the fog leaves the whole block drawn for whoever is looking. */
  readonly shownWhole: boolean;
  /** Whether it is in the selection, and so drawn alone to be shown as selected. */
  readonly selected: boolean;
}

/** The sides of a hex block drawn together with others that its neighbours hide. */
export interface HexBlockWalls {
  readonly identifier: string;
  readonly hidden: ReadonlySet<string>;
}

/** How the blocks that do not move are drawn together. */
export interface StillTerrainLayout {
  /** The identifiers of the blocks drawn together, which are not to be drawn alone as well. */
  readonly merged: ReadonlySet<string>;
  readonly squareCaps: readonly SquareCap[];
  readonly squareWalls: readonly SquareWall[];
  readonly hexCaps: readonly HexCapSheet[];
  readonly hexWalls: readonly HexBlockWalls[];
}

const SIDES: readonly BlockSide[] = ['north', 'south', 'west', 'east'];

/** How many cells a hex flower of this many cells across covers. */
function flowerCellCount(size: number): number {
  return 3 * size * (size - 1) + 1;
}

function topLook(terrain: Terrain): string {
  return `${terrain.faceImageIdentifier('top')}|${terrain.faceImageIdentifier('floor')}`;
}

/**
 * Works out which blocks are drawn together, and the caps, walls and sheets they are drawn as.
 *
 * A block is drawn together with others when {@link isBatchable} allows it, it is not selected,
 * the fog leaves all of it drawn and every cell it covers is on the board and its own. A side of
 * a block that the blocks pressed against it hide is left out, and hidden by any block on the
 * table, whether drawn together with others or alone.
 */
export function stillTerrainLayoutOf(inputs: readonly StillTerrainInput[], grid: CellGrid): StillTerrainLayout {
  const hex = isHexGrid(grid.type);
  const shapes = new Map<string, OcclusionShape>();
  for (const input of inputs) {
    const shape = occlusionShapeOf(input.terrain, grid, input.shownWhole);
    if (shape) shapes.set(input.terrain.identifier, shape);
  }
  const hidden = hiddenFacesByTerrain([...shapes.values()]);

  const candidates: { terrain: Terrain; shape: OcclusionShape }[] = [];
  for (const { terrain, shownWhole, selected } of inputs) {
    if (selected || !shownWhole || !isBatchable(terrain, grid)) continue;
    const shape = shapes.get(terrain.identifier);
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
  const merged = new Set(chosen.map(({ terrain }) => terrain.identifier));
  const gridSize = grid.sizePx;

  if (hex) {
    const hexCaps = hexCapSheetsOf(
      chosen.map(({ terrain, shape }) => ({
        identifier: terrain.identifier,
        cells: shape.cells.map((cell) => {
          const { col, row } = cellColRow(grid, cell);
          return [col, row] as const;
        }),
        topPx: shape.topPx,
        look: `${topLook(terrain)}|${terrain.isTiledTexture ? 'tile' : 'stretch'}|${terrain.width}`,
      })),
      gridSize,
      isFlatTopGrid(grid.type)
    );
    const hexWalls = chosen.map(({ terrain }) => ({
      identifier: terrain.identifier,
      hidden: hiddenFacesOf(hidden, terrain.identifier),
    }));
    return { merged, squareCaps: [], squareWalls: [], hexCaps, hexWalls };
  }

  const squareCaps = squareCapsOf(
    chosen.map(({ terrain, shape }) => ({
      identifier: terrain.identifier,
      col: Math.round(terrain.location.x / gridSize),
      row: Math.round(terrain.location.y / gridSize),
      cols: terrain.width,
      rows: terrain.depth,
      topPx: shape.topPx,
      look: topLook(terrain),
    })),
    gridSize
  );
  const squareWalls: SquareWall[] = [];
  for (const { terrain } of chosen) {
    const covered = hiddenFacesOf(hidden, terrain.identifier);
    for (const side of SIDES) {
      if (!covered.has(side)) squareWalls.push(squareWallOf(terrain, side, gridSize));
    }
  }
  return { merged, squareCaps, squareWalls, hexCaps: [], hexWalls: [] };
}
