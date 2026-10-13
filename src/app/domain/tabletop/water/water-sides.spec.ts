import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { isFlatTopGrid } from '@axe/domain/tabletop/hex-geometry';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';
import { waterSidesOf } from '@axe/domain/tabletop/water/water-sides';

const G = 50;

function area(partial: Partial<WaterArea>): WaterArea {
  return {
    identifier: 'pond',
    left: G,
    top: G,
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

describe('waterSidesOf()', () => {
  it('stands a side along every edge of a lone square cell, from the floor to the surface', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    const sides = waterSidesOf(grid, waterCellsOf(grid, [area({ floorPx: 10, surfacePx: 35 })]));

    expect(sides).toHaveLength(4);
    for (const side of sides) {
      expect(side.bottomPx).toBe(10);
      expect(side.topPx).toBe(35);
      expect(Math.hypot(side.x1 - side.x0, side.y1 - side.y0)).toBeCloseTo(G);
    }
  });

  it('draws no side between two cells of water at one height', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    const sides = waterSidesOf(grid, waterCellsOf(grid, [area({ width: 2 * G })]));
    expect(sides).toHaveLength(6);
  });

  it('shows only the part above lower water beside it', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [
      area({ identifier: 'deep', surfacePx: 50 }),
      area({ identifier: 'shallow', left: 2 * G, surfacePx: 20 }),
    ]);

    const sides = waterSidesOf(grid, cells);

    const between = sides.filter((side) => side.x0 === 2 * G && side.x1 === 2 * G);
    expect(between).toHaveLength(1);
    expect(between[0]).toMatchObject({ bottomPx: 20, topPx: 50, index: cellIndexOf(grid, 1, 1) });
  });

  it('stands a side only above the ground beside it', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    const east = cellIndexOf(grid, 2, 1);
    const sides = waterSidesOf(grid, waterCellsOf(grid, [area({ surfacePx: 50 })]), (index) =>
      index === east ? 20 : 0
    );

    const towardsEast = sides.find((side) => side.x0 === 2 * G && side.x1 === 2 * G);
    expect(towardsEast).toMatchObject({ bottomPx: 20, topPx: 50 });
  });

  it('stands no side towards land as high as the surface', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    const east = cellIndexOf(grid, 2, 1);
    const sides = waterSidesOf(grid, waterCellsOf(grid, [area({ surfacePx: 50 })]), (index) =>
      index === east ? 60 : 0
    );
    expect(sides).toHaveLength(3);
  });

  it('slants the bottom of a side with ground sloping up under the water, rather than stepping it', () => {
    // A slope rising a pixel for every pixel eastward, from the floor at the west of the pond.
    const grid = cellGridOf(6, 4, G, GridType.SQUARE);
    const slope = (x: number) => Math.max(0, x - G);
    const cells = waterCellsOf(grid, [area({ width: 2 * G, surfacePx: 120 })], (index) =>
      slope(cellCenterOf(grid, index).x)
    );

    const sides = waterSidesOf(grid, cells, (_index, x) => slope(x));

    const north = sides.find((side) => side.index === cellIndexOf(grid, 2, 1) && side.y0 === G && side.y1 === G);
    expect(north).toBeDefined();
    expect(north!.bottomStartPx).toBeCloseTo(G, 0);
    expect(north!.bottomEndPx).toBeCloseTo(2 * G, 0);
    expect(north!.bottomPx).toBe(north!.bottomStartPx);
    expect(north!.topPx).toBe(120);
    expect(north!.floorPx).toBe(0);
  });

  it('reads each cell\u2019s own ground at a corner, not the ground of the cell that meets it there', () => {
    // Terraces stepping down on a hex board: each hex is level, and a corner is shared by three.
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const grid = cellGridOf(8, 8, G, type);
      const centre = cellCenterOf(grid, cellIndexOf(grid, 3, 3));
      const cells = waterCellsOf(grid, [area({ left: centre.x - G / 2, top: centre.y - G / 2, surfacePx: 80 })]);
      const terraces = (index: number) => (index === cellIndexOf(grid, 3, 3) ? 0 : 100);

      for (const side of waterSidesOf(grid, cells, terraces)) {
        expect(side.bottomStartPx).toBe(side.bottomEndPx);
      }
    }
  });

  it('keeps the bottom level over a level floor', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    for (const side of waterSidesOf(grid, waterCellsOf(grid, [area({ floorPx: 10, surfacePx: 35 })]))) {
      expect(side.bottomStartPx).toBe(10);
      expect(side.bottomEndPx).toBe(10);
    }
  });

  it('stands no side round water no higher than its floor', () => {
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);
    expect(waterSidesOf(grid, waterCellsOf(grid, [area({ surfacePx: 0 })]))).toHaveLength(0);
  });

  it('stands a side along the edge of the board', () => {
    const grid = cellGridOf(1, 1, G, GridType.SQUARE);
    expect(waterSidesOf(grid, waterCellsOf(grid, [area({ left: 0, top: 0 })]))).toHaveLength(4);
  });

  it('puts each side of a hex towards the hex across it', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const grid = cellGridOf(10, 10, G, type);
      for (const [col, row] of [
        [4, 4],
        [4, 5],
        [5, 4],
        [5, 5],
      ]) {
        const index = cellIndexOf(grid, col, row);
        const centre = cellCenterOf(grid, index);
        const sides = waterSidesOf(grid, waterCellsOf(grid, [area({ left: centre.x - G / 2, top: centre.y - G / 2 })]));
        expect(sides).toHaveLength(6);
        const steps = hexSideStepsAt(isFlatTopGrid(type), col, row);
        sides.forEach((side, at) => {
          const across = cellCenterOf(grid, cellIndexOf(grid, col + steps[at][0], row + steps[at][1]));
          expect((side.x0 + side.x1) / 2).toBeCloseTo((centre.x + across.x) / 2, 3);
          expect((side.y0 + side.y1) / 2).toBeCloseTo((centre.y + across.y) / 2, 3);
        });
      }
    }
  });

  it('draws no side between two hexes of water at one height', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const grid = cellGridOf(10, 10, G, type);
      const a = cellCenterOf(grid, cellIndexOf(grid, 4, 4));
      const b = cellCenterOf(grid, cellIndexOf(grid, 5, 4));
      const cells = waterCellsOf(grid, [
        area({ identifier: 'a', left: a.x - G / 2, top: a.y - G / 2 }),
        area({ identifier: 'b', left: b.x - G / 2, top: b.y - G / 2 }),
      ]);
      expect(waterSidesOf(grid, cells)).toHaveLength(10);
    }
  });
});
