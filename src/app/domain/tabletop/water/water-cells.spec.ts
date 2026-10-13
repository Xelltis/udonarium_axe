import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf, waterLookOf } from '@axe/domain/tabletop/water/water-cells';

const G = 50;

function area(partial: Partial<WaterArea>): WaterArea {
  return {
    identifier: 'pond',
    left: 0,
    top: 0,
    width: G,
    height: G,
    floorPx: 0,
    surfacePx: 25,
    color: '#3399cc',
    density: 0.6,
    ...partial,
  };
}

describe('waterCellsOf()', () => {
  it('takes every cell an area covers on a square board, and no more', () => {
    const grid = cellGridOf(10, 10, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ left: G, top: 2 * G, width: 2 * G, height: 3 * G })]);

    const expected: number[] = [];
    for (let row = 2; row <= 4; row++) for (let col = 1; col <= 2; col++) expected.push(cellIndexOf(grid, col, row));
    expect([...cells.keys()].sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
  });

  it('takes only the hex an area laid around it covers, not the hexes beside it', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const grid = cellGridOf(10, 10, G, type);
      const index = cellIndexOf(grid, 4, 5);
      const centre = cellCenterOf(grid, index);
      const cells = waterCellsOf(grid, [area({ left: centre.x - G / 2, top: centre.y - G / 2 })]);
      expect([...cells.keys()]).toEqual([index]);
    }
  });

  it('gives a cell under two areas the higher surface', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [
      area({ identifier: 'deep', surfacePx: 100, width: 2 * G }),
      area({ identifier: 'shallow', surfacePx: 10, width: 4 * G }),
    ]);
    expect(cells.get(cellIndexOf(grid, 0, 0))?.area).toBe('deep');
    expect(cells.get(cellIndexOf(grid, 3, 0))?.area).toBe('shallow');
  });

  it('never puts a surface below its floor', () => {
    const grid = cellGridOf(2, 2, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ floorPx: 40, surfacePx: 10 })]);
    expect(cells.get(0)?.surfacePx).toBe(40);
  });

  it('leaves out what lies off the board', () => {
    const grid = cellGridOf(2, 2, G, GridType.SQUARE);
    expect(waterCellsOf(grid, [area({ left: 5 * G })]).size).toBe(0);
  });
});

describe('waterLookOf()', () => {
  it('tells water of another height or colour apart', () => {
    const grid = cellGridOf(2, 2, G, GridType.SQUARE);
    const [a] = waterCellsOf(grid, [area({})]).values();
    const [b] = waterCellsOf(grid, [area({ surfacePx: 30 })]).values();
    const [c] = waterCellsOf(grid, [area({ color: '#000000' })]).values();
    expect(waterLookOf(a)).not.toBe(waterLookOf(b));
    expect(waterLookOf(a)).not.toBe(waterLookOf(c));
  });
});
