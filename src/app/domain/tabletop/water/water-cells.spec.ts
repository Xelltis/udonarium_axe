import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf, waterSurfaceLookOf } from '@axe/domain/tabletop/water/water-cells';

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
    turbidity: 0.15,
    dirt: 0,
    leaves: 0,
    flowSpeed: 0,
    flowDirection: 0,
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

  it('stands the water only as deep as the surface over ground risen under it', () => {
    const grid = cellGridOf(4, 1, G, GridType.SQUARE);
    const ground = [0, 10, 30, 0];
    const cells = waterCellsOf(grid, [area({ width: 4 * G, surfacePx: 50 })], (index) => ground[index]);

    expect(cells.get(0)).toMatchObject({ floorPx: 0, flat: true });
    expect(cells.get(1)).toMatchObject({ floorPx: 10, flat: false });
    expect(cells.get(2)).toMatchObject({ floorPx: 30, flat: false });
  });

  it('leaves ground risen to the surface or above dry, as the shore of the water', () => {
    const grid = cellGridOf(3, 1, G, GridType.SQUARE);
    const ground = [0, 50, 80];
    const cells = waterCellsOf(grid, [area({ width: 3 * G, surfacePx: 50 })], (index) => ground[index]);

    expect([...cells.keys()]).toEqual([0]);
  });

  it('keeps water that only wets its floor, as nothing has risen under it', () => {
    const grid = cellGridOf(2, 1, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ width: 2 * G, surfacePx: 0 })], () => 0);
    expect(cells.size).toBe(2);
  });

  it('leaves out what lies off the board', () => {
    const grid = cellGridOf(2, 2, G, GridType.SQUARE);
    expect(waterCellsOf(grid, [area({ left: 5 * G })]).size).toBe(0);
  });
});

describe('waterSurfaceLookOf()', () => {
  it('tells water of another height or colour apart', () => {
    const grid = cellGridOf(2, 2, G, GridType.SQUARE);
    const [a] = waterCellsOf(grid, [area({})]).values();
    const [b] = waterCellsOf(grid, [area({ surfacePx: 30 })]).values();
    const [c] = waterCellsOf(grid, [area({ color: '#000000' })]).values();
    expect(waterSurfaceLookOf(a)).not.toBe(waterSurfaceLookOf(b));
    expect(waterSurfaceLookOf(a)).not.toBe(waterSurfaceLookOf(c));
  });
});
