import { depthShadeAlpha, murkShade, murkSightCells } from '@axe/domain/tabletop/water/water-depth';

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

describe('seeing through water from inside it', () => {
  it('sees far through clear water and less than a cell through water nothing can be seen through', () => {
    expect(murkSightCells(0)).toBeGreaterThan(25);
    expect(murkSightCells(0.15)).toBeGreaterThan(15);
    expect(murkSightCells(0.5)).toBeLessThan(murkSightCells(0.15) / 2);
    expect(murkSightCells(1)).toBeLessThan(1);
    expect(murkSightCells(Number.NaN)).toBe(murkSightCells(0));
  });

  it('hides nothing at the eye and all of what stands past where one sees', () => {
    expect(murkShade(0, 1)).toBe(0);
    expect(murkShade(0.4, 1)).toBeGreaterThan(0.6);
    expect(murkShade(2, 1)).toBe(1);
    expect(murkShade(3, 0.15)).toBeLessThan(0.5);
    expect(murkShade(murkSightCells(0.5), 0.5)).toBeGreaterThan(0.9);
  });
});
