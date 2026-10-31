import {
  cellCenterOf,
  cellCount,
  cellGridOf,
  cellIndexAt,
  cellIndexOf,
  forEachCellInBox,
} from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';
import { WATER_REACH_CELLS, waterGridOver } from '@axe/domain/tabletop/water/water-grid';
import { waterSheetsOf } from '@axe/domain/tabletop/water/water-sheets';

const SIZE = 50;

function area(col: number, row: number, cols: number, rows: number): WaterArea {
  return {
    identifier: `pond-${col}-${row}`,
    left: col * SIZE,
    top: row * SIZE,
    width: cols * SIZE,
    height: rows * SIZE,
    floorPx: 0,
    surfacePx: SIZE / 2,
    color: '',
    density: 0.5,
    turbidity: 0.15,
    dirt: 0,
    leaves: 0,
    flowSpeed: 0,
    flowDirection: 0,
  };
}

describe('waterGridOver()', () => {
  const square = cellGridOf(10, 8, SIZE, GridType.SQUARE);

  it('lays water on the board on the table grid itself', () => {
    expect(waterGridOver(square, [area(0, 0, 10, 8), area(3, 3, 2, 2)])).toBe(square);
  });

  it('reaches past the edges as far as the water laid off the board does', () => {
    const grid = waterGridOver(square, [area(-5, -3, 2, 2), area(11, 9, 2, 1)]);
    const cells = waterCellsOf(grid, [area(-5, -3, 2, 2), area(11, 9, 2, 1)]);

    expect(cells.size).toBe(6);
    expect(Math.abs(grid.originCol! % 2)).toBe(0);
    expect(Math.abs(grid.originRow! % 2)).toBe(0);
  });

  it('keeps every cell of the table where it stands on the table grid', () => {
    const grid = waterGridOver(square, [area(-5, -3, 2, 2)]);
    for (let row = 0; row < square.rows; row++) {
      for (let col = 0; col < square.cols; col++) {
        const centre = cellCenterOf(square, cellIndexOf(square, col, row));
        expect(cellCenterOf(grid, cellIndexAt(grid, centre.x, centre.y))).toEqual(centre);
      }
    }
  });

  it('draws water off the board where it was laid', () => {
    const pond = area(-5, -3, 2, 1);
    const grid = waterGridOver(square, [pond]);
    const [sheet] = waterSheetsOf(grid, waterCellsOf(grid, [pond]).values(), () => '');

    expect(sheet).toMatchObject({ left: pond.left, top: pond.top, width: pond.width, height: pond.height });
  });

  it('reaches no further than a long way off the board', () => {
    const grid = waterGridOver(square, [area(-200, 0, 201, 1)]);

    expect(grid.originCol).toBe(-WATER_REACH_CELLS);
    expect(cellCount(grid)).toBeLessThanOrEqual((square.cols + WATER_REACH_CELLS) * square.rows);
  });

  it('is drawn out by no water lying wholly beyond its reach', () => {
    expect(waterGridOver(square, [area(-10_000, 0, 1, 1), area(3, 3, 1, 1)])).toBe(square);
  });

  it('lays water on the board of hexes on the table grid itself, along its edges too', () => {
    const hex = cellGridOf(8, 8, SIZE, GridType.HEX_HORIZONTAL);
    const corner = { ...area(0, 0, 1, 1), width: SIZE * 0.8, height: SIZE * 0.7 };

    expect(waterGridOver(hex, [corner])).toBe(hex);
  });

  for (const [type, name] of [
    [GridType.HEX_VERTICAL, 'flat-top'],
    [GridType.HEX_HORIZONTAL, 'pointy-top'],
  ] as const) {
    it(`finds every hex again by its middle off the board too, on ${name} hexes`, () => {
      const hex = cellGridOf(8, 8, SIZE, type);
      const grid = waterGridOver(hex, [area(-3, -3, 2, 2)]);
      expect(grid.originCol).toBeLessThan(0);

      for (let index = 0; index < cellCount(grid); index++) {
        const centre = cellCenterOf(grid, index);
        expect(cellIndexAt(grid, centre.x, centre.y)).toBe(index);
      }
      const visited: number[] = [];
      forEachCellInBox(grid, -3 * SIZE, -3 * SIZE, -SIZE, -SIZE, (index) => visited.push(index));
      expect(visited.length).toBeGreaterThan(0);
    });
  }
});
