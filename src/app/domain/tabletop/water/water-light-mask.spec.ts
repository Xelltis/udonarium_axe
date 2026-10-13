import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { waterLightMaskOf } from '@axe/domain/tabletop/water/water-light-mask';

const G = 50;

describe('waterLightMaskOf()', () => {
  const grid = cellGridOf(4, 4, G, GridType.SQUARE);
  const sheet = {
    left: 0,
    top: 0,
    width: 2 * G,
    height: G,
    cells: [cellIndexOf(grid, 0, 0), cellIndexOf(grid, 1, 0)],
  };

  it('masks nothing where the whole sheet is lit', () => {
    expect(waterLightMaskOf(grid, sheet, () => 1)).toBeNull();
  });

  it('fades the water out over the cells in the dark', () => {
    const mask = waterLightMaskOf(grid, sheet, (index) => (index === cellIndexOf(grid, 0, 0) ? 1 : 0));

    expect(mask).not.toBeNull();
    expect(mask!.cols).toBe(4);
    expect(mask!.rows).toBe(2);
    expect(mask!.alpha[0]).toBe(255);
    expect(mask!.alpha[3]).toBe(0);
  });

  it('dims the whole sheet evenly where all of it is dim', () => {
    const mask = waterLightMaskOf(grid, sheet, () => 0.5);
    expect(mask).not.toBeNull();
    expect([...mask!.alpha].every((value) => value === 128)).toBe(true);
  });

  it('gives what lies off the water the light of the sheet, so its edge does not darken', () => {
    const lShape = {
      ...sheet,
      height: 2 * G,
      cells: [cellIndexOf(grid, 0, 0), cellIndexOf(grid, 1, 0), cellIndexOf(grid, 0, 1)],
    };
    const mask = waterLightMaskOf(grid, lShape, (index) => (index === cellIndexOf(grid, 0, 0) ? 1 : 0.4));
    const offWater = mask!.alpha[3 * mask!.cols + 3];
    expect(offWater).toBe(Math.round(((1 + 0.4 + 0.4) / 3) * 255));
  });
});
