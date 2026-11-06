import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { groundOverIce, ICE_BEARS_AT } from '@axe/domain/tabletop/ground/ground-over-ice';
import { FLAT_GROUND, type GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';
import type { WaterCell } from '@axe/domain/tabletop/water/water-cells';

const G = 50;

function iceOver(index: number, surfacePx: number, ice = 1): WaterCell {
  return {
    index,
    cx: 0,
    cy: 0,
    floorPx: -25,
    surfacePx,
    flat: false,
    areaFloorPx: 0,
    color: '',
    density: 0.6,
    turbidity: 0,
    dirt: 0,
    leaves: 0,
    flowSpeed: 0,
    flowDirection: 0,
    ice,
    area: 'lake',
  };
}

/** Ground dug half a cell down everywhere, as the bed of a lake is. */
const DUG: GroundSurface = { isFlat: false, sampleAt: () => -0.5, paintAt: () => null, heightAt: () => -0.5 };

describe('the ground as what stands on the floor stands on it, over ice', () => {
  const grid = cellGridOf(4, 4, G, GridType.SQUARE);
  const index = cellIndexOf(grid, 1, 1);

  it('stands what is on a cell of ice on the ice, all over the cell, rather than on the bed under it', () => {
    const ground = groundOverIce(DUG, new Map([[index, iceOver(index, 0)]]), grid);

    expect(ground.isFlat).toBe(false);
    expect(ground.heightAt(1.5, 1.5)).toBe(0);
    expect(ground.heightAt(1.05, 1.95)).toBe(0);
    expect(ground.heightAt(3.5, 3.5)).toBe(-0.5);
  });

  it('stands it on ice raised over flat ground, and leaves ground standing over the ice as it is', () => {
    const raised = groundOverIce(FLAT_GROUND, new Map([[index, iceOver(index, 0.5 * G)]]), grid);
    expect(raised.heightAt(1.5, 1.5)).toBe(0.5);
    expect(raised.heightAt(3.5, 0.5)).toBe(0);

    const high: GroundSurface = { isFlat: false, sampleAt: () => 2, paintAt: () => null, heightAt: () => 2 };
    expect(groundOverIce(high, new Map([[index, iceOver(index, 0)]]), grid).heightAt(1.5, 1.5)).toBe(2);
  });

  it('leaves water not frozen hard enough to bear, and a table with no ice, as the ground was', () => {
    const thin = new Map([[index, iceOver(index, 0, ICE_BEARS_AT - 0.1)]]);
    expect(groundOverIce(DUG, thin, grid)).toBe(DUG);
    expect(groundOverIce(DUG, new Map(), grid)).toBe(DUG);
    expect(groundOverIce(DUG, new Map([[index, iceOver(index, 0)]]), null)).toBe(DUG);
  });

  it('stands what is on a hex of ice on the ice, either way the hexes stand', () => {
    for (const type of [GridType.HEX_HORIZONTAL, GridType.HEX_VERTICAL]) {
      const hexes = cellGridOf(6, 6, G, type);
      const hex = cellIndexOf(hexes, 2, 2);
      const ground = groundOverIce(DUG, new Map([[hex, iceOver(hex, 0)]]), hexes);
      const middle = cellCenterOf(hexes, hex);

      expect(ground.heightAt(middle.x / G, middle.y / G)).toBe(0);
      expect(ground.heightAt(0.2, 0.2)).toBe(-0.5);
    }
  });
});
