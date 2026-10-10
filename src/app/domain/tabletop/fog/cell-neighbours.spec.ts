import { CellGrid, forEachNeighbourCell } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { legacyForEachNeighbourCell } from '@axe/testing/legacy-hex-lookup';
import { describe, expect, it } from 'vitest';

const GRID_TYPES = [
  { name: 'square', type: GridType.SQUARE },
  { name: 'flat-topped hex', type: GridType.HEX_VERTICAL },
  { name: 'pointy-topped hex', type: GridType.HEX_HORIZONTAL },
];
const BOARDS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, 5],
  [5, 1],
  [2, 2],
  [7, 6],
];
const CELL_SIZES = [1, 25, 50];

function neighbourSet(
  lookup: (grid: CellGrid, index: number, visit: (neighbour: number) => void) => void,
  grid: CellGrid,
  index: number
): number[] {
  const found = new Set<number>();
  lookup(grid, index, (neighbour) => found.add(neighbour));
  return [...found].sort((a, b) => a - b);
}

describe('forEachNeighbourCell against the eight-way probe it replaced', () => {
  for (const { name, type } of GRID_TYPES) {
    it(`finds the same neighbours on a ${name} grid`, () => {
      const misses: {
        cols: number;
        rows: number;
        sizePx: number;
        index: number;
        expected: number[];
        actual: number[];
      }[] = [];
      for (const [cols, rows] of BOARDS) {
        for (const sizePx of CELL_SIZES) {
          const grid: CellGrid = { cols, rows, sizePx, type };
          for (let index = 0; index < cols * rows; index++) {
            const expected = neighbourSet(legacyForEachNeighbourCell, grid, index);
            const actual = neighbourSet(forEachNeighbourCell, grid, index);
            if (expected.join() !== actual.join()) misses.push({ cols, rows, sizePx, index, expected, actual });
          }
        }
      }
      expect(misses.slice(0, 5)).toEqual([]);
    });

    it(`finds no neighbours on a ${name} grid with no size`, () => {
      const grid: CellGrid = { cols: 4, rows: 4, sizePx: 0, type };
      expect(neighbourSet(forEachNeighbourCell, grid, 5)).toEqual([]);
      expect(neighbourSet(legacyForEachNeighbourCell, grid, 5)).toEqual([]);
    });
  }
});
