import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';
import { floorWashAlpha, surfaceWashAlpha } from '@axe/domain/tabletop/water/water-look';
import { waterShoreOf } from '@axe/domain/tabletop/water/water-shore';
import { waterSidesOf } from '@axe/domain/tabletop/water/water-sides';
import { tableWaterOf } from '@axe/domain/tabletop/world/table-water';

const G = 50;

function area(partial: Partial<WaterArea> = {}): WaterArea {
  return {
    identifier: 'pond',
    left: G,
    top: G,
    width: 2 * G,
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

/** The heights of the points of a part, every third figure from the third. */
function heightsOf(points: Float32Array): number[] {
  return [...points].filter((_, index) => index % 3 === 2);
}

describe('the water on a table as the scene draws it', () => {
  const grid = cellGridOf(4, 4, G, GridType.SQUARE);

  it('lays a surface over every cell under water, at its surface, and a floor under water on its own floor', () => {
    const cells = waterCellsOf(grid, [area()]);
    const water = tableWaterOf(grid, cells, [], [], true);

    expect(water.surface.points.length).toBe(2 * 2 * 3 * 3);
    expect(new Set(heightsOf(water.surface.points))).toEqual(new Set([25]));
    expect(water.floor.points.length).toBe(2 * 2 * 3 * 3);
    expect(Math.max(...heightsOf(water.floor.points))).toBeLessThan(1);
    expect(water.moving).toBe(true);
  });

  it('colours the surface over the floor, the surface’s own colour over the depths, more opaque than either alone', () => {
    const water = tableWaterOf(grid, waterCellsOf(grid, [area()]), [], [], true);
    const alpha = water.surface.colours[3];

    expect(alpha).toBeGreaterThan(surfaceWashAlpha(0.6));
    expect(alpha).toBeLessThan(1);
    expect(water.floor.colours[3]).toBeCloseTo(floorWashAlpha(0.6));
  });

  it('runs the colour of the depths smoothly across the corner two cells of different depths share', () => {
    const cells = waterCellsOf(grid, [
      area({ width: G }),
      area({ identifier: 'deep', left: 2 * G, width: G, surfacePx: 150 }),
    ]);
    const water = tableWaterOf(grid, cells, [], [], true);
    const alphaAt = (x: number, y: number, z: number) => {
      for (let i = 0; i < water.surface.points.length / 3; i++) {
        const [px, py, pz] = water.surface.points.slice(i * 3, i * 3 + 3);
        if (px === x && py === y && pz === z) return water.surface.colours[i * 4 + 3];
      }
      return null;
    };

    const shallowFar = alphaAt(G, G, 25)!;
    const shallowShared = alphaAt(2 * G, G, 25)!;
    const deepShared = alphaAt(2 * G, G, 150)!;
    expect(shallowShared).toBeGreaterThan(shallowFar);
    expect(deepShared).toBeCloseTo(shallowShared);
  });

  it('stands the sides up from their bottoms to the surface, and lays the shore along the land', () => {
    const cells = waterCellsOf(grid, [area({ floorPx: 10, surfacePx: 35 })]);
    const sides = waterSidesOf(grid, cells);
    const water = tableWaterOf(
      grid,
      cells,
      sides,
      waterShoreOf(grid, cells, () => 35),
      true
    );

    expect(water.sides.points.length).toBe(sides.length * 6 * 3);
    expect(new Set(heightsOf(water.sides.points))).toEqual(new Set([10, 35]));
    expect(water.shore.points.length).toBeGreaterThan(0);
  });

  it('carries the surface along the way flowing water flows', () => {
    const water = tableWaterOf(grid, waterCellsOf(grid, [area({ flowSpeed: 1, flowDirection: 90 })]), [], [], true);

    expect(water.flow[0]).toBeGreaterThan(0);
    expect(water.flow[1]).toBeCloseTo(0);
  });

  it('draws nothing where there is no water, and holds the water still for a reader who asks for less motion', () => {
    const none = tableWaterOf(grid, new Map(), [], [], false);

    expect(none.surface.points.length).toBe(0);
    expect(none.moving).toBe(false);
  });
});
