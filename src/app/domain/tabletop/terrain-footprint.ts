import { CellStep, hexStepsAt } from '@axe/domain/tabletop/cell-steps';
import { CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import {
  hexCellCenter,
  hexLayoutOf,
  isFlatTopGrid,
  isHexGrid,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';

/** How far a stored number may sit from a whole number of cells and still be counted as on the grid. */
const GRID_TOLERANCE = 1e-6;

function wholeCells(value: number): number | null {
  const rounded = Math.round(value);
  return Number.isFinite(value) && Math.abs(value - rounded) < GRID_TOLERANCE ? rounded : null;
}

function finite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Whether a turn is a whole number of degrees that is a multiple of the given step. */
function turnsBy(rotate: number, step: number): boolean {
  const turn = ((Math.round(rotate) % 360) + 360) % 360;
  return Math.abs(rotate - Math.round(rotate)) < GRID_TOLERANCE && turn % step === 0;
}

/**
 * The cells a block standing on the floor covers, as indices on the board, those off it left out:
 * only a block that lies square on the grid of the table it stands on, whole cells across and
 * standing up off the floor, covers cells of its own. Its corners lie on cell corners on a square
 * board, and its middle on a cell's middle on a hex board, where it covers the flower of hexes as
 * many across as it is; it is turned only by whole steps of the grid. Anything else answers null.
 */
export function blockFootprintOf(terrain: Terrain, grid: CellGrid): number[] | null {
  if (surfaceOf(terrain) !== 'floor' || grid.sizePx <= 0) return null;
  const g = grid.sizePx;
  const width = wholeCells(finite(terrain.width) ?? NaN);
  const depth = wholeCells(finite(terrain.depth) ?? NaN);
  const height = finite(terrain.height);
  const altitude = finite(terrain.altitude);
  const rotate = finite(terrain.rotate);
  if (width === null || depth === null || width < 1 || depth < 1) return null;
  if (height === null || height <= 0 || altitude === null || altitude < 0 || rotate === null) return null;

  if (isHexGrid(grid.type)) return turnsBy(rotate, 60) ? hexFootprint(terrain, grid, width, depth) : null;
  if (!turnsBy(rotate, 90)) return null;
  const box = terrainBoxOf(terrain, g);
  const left = wholeCells(box.minX / g);
  const top = wholeCells(box.minY / g);
  const right = wholeCells(box.maxX / g);
  const bottom = wholeCells(box.maxY / g);
  if (left === null || top === null || right === null || bottom === null) return null;
  const cells: number[] = [];
  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      const index = cellIndexOf(grid, col, row);
      if (index >= 0) cells.push(index);
    }
  }
  return cells;
}

/** The flower of hexes a block stands on, its middle on the middle of a hex, or null where it is not. */
function hexFootprint(terrain: Terrain, grid: CellGrid, width: number, depth: number): number[] | null {
  const g = grid.sizePx;
  const isFlatTop = isFlatTopGrid(grid.type);
  const layout = hexLayoutOf(g, isFlatTop);
  const centreX = terrain.location.x + (width * g) / 2;
  const centreY = terrain.location.y + (depth * g) / 2;
  const middle = pixelToHexCell(centreX, centreY, g, isFlatTop);
  const onCell = hexCellCenter(middle.col, middle.row, layout.colSpacing, layout.rowSpacing, isFlatTop);
  if (Math.abs(onCell.x - centreX) > 0.5 || Math.abs(onCell.y - centreY) > 0.5) return null;

  const reach = Math.min(width, depth) - 1;
  const covered = new Map<string, [number, number]>([[`${middle.col},${middle.row}`, [middle.col, middle.row]]]);
  let ring: [number, number][] = [[middle.col, middle.row]];
  for (let step = 0; step < reach; step++) {
    const next: [number, number][] = [];
    for (const [col, row] of ring) {
      for (const [dx, dy] of hexStepsAt(isFlatTop, col, row) as readonly CellStep[]) {
        const key = `${col + dx},${row + dy}`;
        if (covered.has(key)) continue;
        covered.set(key, [col + dx, row + dy]);
        next.push([col + dx, row + dy]);
      }
    }
    ring = next;
  }
  const cells: number[] = [];
  for (const [col, row] of covered.values()) {
    const index = cellIndexOf(grid, col, row);
    if (index >= 0) cells.push(index);
  }
  return cells;
}
