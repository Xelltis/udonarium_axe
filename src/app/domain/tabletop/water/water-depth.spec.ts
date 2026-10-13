import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { depthShadeAlpha, waterDepthShadeOf } from '@axe/domain/tabletop/water/water-depth';

describe('depthShadeAlpha()', () => {
  it('leaves the shallows nearly clear and gathers the colour as the bottom falls away', () => {
    expect(depthShadeAlpha(0, 0)).toBe(0);
    expect(depthShadeAlpha(0.2, 0)).toBeLessThan(0.05);
    expect(depthShadeAlpha(4, 0)).toBeGreaterThan(depthShadeAlpha(1, 0) * 2);
    expect(depthShadeAlpha(40, 0)).toBeLessThanOrEqual(0.55);
  });

  it('hides the bottom of murky water within a cell', () => {
    expect(depthShadeAlpha(1, 1)).toBeGreaterThan(0.75);
    expect(depthShadeAlpha(1, 1)).toBeGreaterThan(depthShadeAlpha(1, 0.15) * 2);
  });
});

describe('waterDepthShadeOf()', () => {
  const grid = cellGridOf(4, 1, 50, GridType.SQUARE);
  const sheet = { left: 0, top: 0, width: 200, height: 50, cells: [0, 1, 2, 3] };

  it('lays one strength over water of one depth', () => {
    expect(waterDepthShadeOf(grid, sheet, () => 2, 0)).toEqual({ alpha: depthShadeAlpha(2, 0) });
  });

  it('paints the colour deepening out from the shore over a bottom that falls away', () => {
    const depths = [0.1, 1, 2, 4];
    const shade = waterDepthShadeOf(grid, sheet, (index) => depths[index], 0);

    expect('cols' in shade).toBe(true);
    if (!('cols' in shade)) return;
    expect(shade.cols).toBe(8);
    expect(shade.alpha[0]).toBeLessThan(shade.alpha[7]);
    expect(shade.alpha[cellIndexOf(grid, 0, 0)]).toBe(Math.round(depthShadeAlpha(0.1, 0) * 255));
  });
});
