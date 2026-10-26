import { cellCenter, cellNeighbors, cellOriginOffset, pointToCell } from '@axe/domain/map-editor/grid-cells';
import { GridType } from '@axe/domain/tabletop/game-table';
import { hexCellCenter, hexCircumradius, hexSpacing, isFlatTopGrid } from '@axe/domain/tabletop/hex-geometry';
import { describe, expect, it } from 'vitest';

const CELL = 64;

function minHexSpacing(gridType: GridType): number {
  const flatTop = isFlatTopGrid(gridType);
  const { colSpacing, rowSpacing } = hexSpacing(CELL, flatTop);
  return flatTop ? rowSpacing : colSpacing;
}

describe('cellNeighbors square', () => {
  it('returns the 4 orthogonal neighbors', () => {
    const n = cellNeighbors(GridType.SQUARE, 3, 5);
    expect(n).toHaveLength(4);
    expect(n).toContainEqual([2, 5]);
    expect(n).toContainEqual([4, 5]);
    expect(n).toContainEqual([3, 4]);
    expect(n).toContainEqual([3, 6]);
  });
});

describe('cellNeighbors hex distance parity', () => {
  for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
    const flatTop = isFlatTopGrid(gridType);
    const { colSpacing, rowSpacing } = hexSpacing(CELL, flatTop);
    const expected = minHexSpacing(gridType);

    it(`gives 6 equidistant neighbors for gridType ${gridType}`, () => {
      const cells: [number, number][] = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 3],
        [3, 2],
        [4, 4],
        [5, 6],
      ];
      for (const [col, row] of cells) {
        const center = hexCellCenter(col, row, colSpacing, rowSpacing, flatTop);
        const neighbors = cellNeighbors(gridType, col, row);
        expect(neighbors).toHaveLength(6);
        const keys = new Set(neighbors.map(([c, r]) => `${c},${r}`));
        expect(keys.size).toBe(6);
        for (const [nc, nr] of neighbors) {
          const nCenter = hexCellCenter(nc, nr, colSpacing, rowSpacing, flatTop);
          const dist = Math.hypot(nCenter.x - center.x, nCenter.y - center.y);
          expect(Math.abs(dist - expected)).toBeLessThan(1e-6);
        }
      }
    });
  }
});

describe('cellOriginOffset', () => {
  it('is zero for square grids', () => {
    expect(cellOriginOffset(GridType.SQUARE, CELL)).toEqual({ x: 0, y: 0 });
    expect(cellOriginOffset(GridType.NONE, CELL)).toEqual({ x: 0, y: 0 });
  });

  it('matches the footprint inset for flat-top hex', () => {
    const s = hexCircumradius(CELL);
    expect(cellOriginOffset(GridType.HEX_VERTICAL, CELL)).toEqual({ x: s, y: CELL / 2 });
  });

  it('matches the footprint inset for pointy-top hex', () => {
    const s = hexCircumradius(CELL);
    expect(cellOriginOffset(GridType.HEX_HORIZONTAL, CELL)).toEqual({ x: CELL / 2, y: s });
  });
});

describe('cellCenter applies the footprint offset for hex', () => {
  for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
    it(`offsets every center by cellOriginOffset for gridType ${gridType}`, () => {
      const flatTop = isFlatTopGrid(gridType);
      const { colSpacing, rowSpacing } = hexSpacing(CELL, flatTop);
      const off = cellOriginOffset(gridType, CELL);
      for (let col = 0; col < 4; col += 1) {
        for (let row = 0; row < 4; row += 1) {
          const raw = hexCellCenter(col, row, colSpacing, rowSpacing, flatTop);
          const center = cellCenter(gridType, col, row, CELL);
          expect(center.x).toBeCloseTo(raw.x + off.x, 9);
          expect(center.y).toBeCloseTo(raw.y + off.y, 9);
        }
      }
    });
  }
});

describe('pointToCell <-> cellCenter round-trip (offset-aware)', () => {
  for (const gridType of [GridType.SQUARE, GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
    it(`recovers the cell from its own offset center for gridType ${gridType}`, () => {
      for (let col = 0; col < 6; col += 1) {
        for (let row = 0; row < 6; row += 1) {
          const { x, y } = cellCenter(gridType, col, row, CELL);
          const back = pointToCell(gridType, x, y, CELL);
          expect(back.col).toBe(col);
          expect(back.row).toBe(row);
        }
      }
    });
  }
});
