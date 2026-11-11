import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';

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
    ice: 0,
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

  it('reaches down to the ground where it has been dug below the board and the water’s floor', () => {
    const grid = cellGridOf(10, 10, G, GridType.SQUARE);
    const pit = cellIndexOf(grid, 0, 0);

    const [cell] = [...waterCellsOf(grid, [area({})], (index) => (index === pit ? -40 : 0)).values()];

    expect(cell).toMatchObject({ floorPx: -40, surfacePx: 25, flat: false });
    expect([...waterCellsOf(grid, [area({})], () => 0).values()][0]).toMatchObject({ floorPx: 0, flat: true });
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

  describe('running into dug ground', () => {
    /** Ground dug 40 pixels down at the cells given, by column and row, and flat elsewhere. */
    function dugAt(grid: ReturnType<typeof cellGridOf>, ...at: [number, number][]) {
      const dug = new Set(at.map(([col, row]) => cellIndexOf(grid, col, row)));
      return (index: number) => (dug.has(index) ? -40 : 0);
    }

    it('fills a ditch dug from a pond at the pond’s surface, as far as it runs, and no further', () => {
      const grid = cellGridOf(10, 10, G, GridType.SQUARE);
      const ditch: [number, number][] = [
        [1, 0],
        [2, 0],
        [3, 0],
        [3, 1],
      ];

      const cells = waterCellsOf(grid, [area({})], dugAt(grid, ...ditch));

      for (const [col, row] of ditch) {
        expect(cells.get(cellIndexOf(grid, col, row))).toMatchObject({
          floorPx: -40,
          surfacePx: 25,
          flat: false,
          area: 'pond',
        });
      }
      expect(cells.size).toBe(1 + ditch.length);
      expect(cells.get(cellIndexOf(grid, 0, 0))!.surfacePx).toBe(25);
    });

    it('leaves dry a pit the water does not reach, ground not dug, and a pit touching it by a corner', () => {
      const grid = cellGridOf(10, 10, G, GridType.SQUARE);

      const cells = waterCellsOf(grid, [area({})], dugAt(grid, [1, 1], [5, 5]));

      expect([...cells.keys()]).toEqual([cellIndexOf(grid, 0, 0)]);
    });

    it('runs along the six sides of a hex', () => {
      for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
        const grid = cellGridOf(10, 10, G, type);
        const pond = cellIndexOf(grid, 4, 5);
        const centre = cellCenterOf(grid, pond);
        const around: number[] = [];
        for (let col = 3; col <= 5; col++) {
          for (let row = 4; row <= 6; row++) {
            const index = cellIndexOf(grid, col, row);
            const there = cellCenterOf(grid, index);
            if (index !== pond && Math.hypot(there.x - centre.x, there.y - centre.y) < G * 1.2) around.push(index);
          }
        }
        const dug = new Set(around);

        const cells = waterCellsOf(grid, [area({ left: centre.x - G / 2, top: centre.y - G / 2 })], (index) =>
          dug.has(index) ? -40 : 0
        );

        expect(around).toHaveLength(6);
        expect([...cells.keys()].sort((a, b) => a - b)).toEqual([pond, ...around].sort((a, b) => a - b));
      }
    });

    it('fills a ditch shallower than a sunk pond’s floor, up to the pond’s surface', () => {
      const grid = cellGridOf(10, 10, G, GridType.SQUARE);
      const ground = new Map([
        [cellIndexOf(grid, 0, 0), -40],
        [cellIndexOf(grid, 1, 0), -20],
      ]);
      const shallow = (index: number) => ground.get(index) ?? 0;

      const cells = waterCellsOf(grid, [area({ floorPx: -40, surfacePx: -5 })], shallow);

      expect(cells.get(cellIndexOf(grid, 1, 0))).toMatchObject({ floorPx: -20, surfacePx: -5 });
    });

    it('fills from the higher of two waters a ditch dug between them', () => {
      const grid = cellGridOf(10, 10, G, GridType.SQUARE);
      const cells = waterCellsOf(
        grid,
        [area({ identifier: 'low', surfacePx: 10 }), area({ identifier: 'high', left: 4 * G, surfacePx: 30 })],
        dugAt(grid, [1, 0], [2, 0], [3, 0])
      );

      expect(cells.get(cellIndexOf(grid, 2, 0))).toMatchObject({ surfacePx: 30, area: 'high' });
      expect(cells.get(cellIndexOf(grid, 0, 0))).toMatchObject({ surfacePx: 10, area: 'low' });
    });

    it('runs no higher water over a lower pond sunk in dug ground, which keeps its own ice and look', () => {
      const grid = cellGridOf(10, 10, G, GridType.SQUARE);
      const cells = waterCellsOf(
        grid,
        [
          area({ identifier: 'pit', floorPx: -40, surfacePx: -10, ice: 1, color: '#ddeeff' }),
          area({ identifier: 'open', left: 2 * G, surfacePx: 25 }),
        ],
        dugAt(grid, [0, 0], [1, 0])
      );

      expect(cells.get(cellIndexOf(grid, 0, 0))).toMatchObject({
        surfacePx: -10,
        ice: 1,
        color: '#ddeeff',
        area: 'pit',
      });
      expect(cells.get(cellIndexOf(grid, 1, 0))).toMatchObject({ surfacePx: 25, area: 'open' });
    });
  });
});
