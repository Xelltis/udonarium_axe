import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';
import { waterShoreOf } from '@axe/domain/tabletop/water/water-shore';

const G = 50;

function area(partial: Partial<WaterArea>): WaterArea {
  return {
    identifier: 'sea',
    left: 0,
    top: 0,
    width: G,
    height: G,
    floorPx: 0,
    surfacePx: 50,
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

describe('waterShoreOf()', () => {
  it('breaks the waves where the land beside rises to the surface', () => {
    // The sea runs west to east, and the beach rises out of it in the last two columns.
    const grid = cellGridOf(5, 1, G, GridType.SQUARE);
    const ground = [0, 0, 30, 50, 80];
    const groundOf = (index: number) => ground[index];
    const cells = waterCellsOf(grid, [area({ width: 5 * G })], groundOf);

    const shores = waterShoreOf(grid, cells, groundOf);

    expect(shores).toHaveLength(1);
    expect(shores[0]).toMatchObject({ index: cellIndexOf(grid, 2, 0), x0: 3 * G, x1: 3 * G, surfacePx: 50 });
  });

  it('breaks no waves against lower ground, water, or the edge of the board', () => {
    const grid = cellGridOf(3, 1, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ left: G })], () => 0);
    expect(waterShoreOf(grid, cells, () => 0)).toHaveLength(0);
  });

  it('runs along the shore with the water on its right, so the waves come in from the right side', () => {
    const grid = cellGridOf(3, 3, G, GridType.SQUARE);
    const centre = cellIndexOf(grid, 1, 1);
    const cells = waterCellsOf(grid, [area({ left: G, top: G })], () => 0);
    const [shore] = waterShoreOf(grid, cells, (index) => (index === cellIndexOf(grid, 1, 0) ? 60 : 0));

    const along = { x: shore.x1 - shore.x0, y: shore.y1 - shore.y0 };
    const right = { x: -along.y, y: along.x };
    const middle = cellCenterOf(grid, centre);
    const towardsWater = (middle.x - shore.x0) * right.x + (middle.y - shore.y0) * right.y;
    expect(towardsWater).toBeGreaterThan(0);
  });

  it('finds the shore of a hex board along the side of the hex that faces the land', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const grid = cellGridOf(6, 6, G, type);
      const index = cellIndexOf(grid, 2, 2);
      const centre = cellCenterOf(grid, index);
      const cells = waterCellsOf(grid, [area({ left: centre.x - G / 2, top: centre.y - G / 2 })], () => 0);
      const land = cellIndexOf(grid, 3, 2);

      const shores = waterShoreOf(grid, cells, (at) => (at === land ? 60 : 0));

      expect(shores).toHaveLength(1);
      const across = cellCenterOf(grid, land);
      expect((shores[0].x0 + shores[0].x1) / 2).toBeCloseTo((centre.x + across.x) / 2, 3);
      expect((shores[0].y0 + shores[0].y1) / 2).toBeCloseTo((centre.y + across.y) / 2, 3);
    }
  });
});
