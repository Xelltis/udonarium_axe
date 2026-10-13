import { submergedClip, submersionOf, waterlineMask, waterTintFilter } from '@axe/domain/tabletop/water/submersion';

describe('submersionOf()', () => {
  it('leaves a piece whose feet are above the surface dry', () => {
    expect(submersionOf(60, 100, 50)).toBeNull();
    expect(submersionOf(50, 100, 50)).toBeNull();
  });

  it('tells how much of a wading piece is under the surface', () => {
    expect(submersionOf(0, 100, 25)).toEqual({ share: 0.25, depthPx: 25 });
  });

  it('sinks a piece no further than all of it', () => {
    expect(submersionOf(0, 40, 100)).toEqual({ share: 1, depthPx: 100 });
  });

  it('reads a piece standing on a raised floor against the water over that floor', () => {
    expect(submersionOf(30, 100, 55)?.share).toBeCloseTo(0.25);
  });

  it('draws nothing for a picture of no height', () => {
    expect(submersionOf(0, 0, 50)).toBeNull();
  });
});

describe('the waterline on a picture', () => {
  it('lets the picture show through below the line and keeps it whole above', () => {
    expect(waterlineMask(0.25)).toBe('linear-gradient(to top, rgba(0, 0, 0, 0.6) 23.5%, #000 26.5%)');
  });

  it('keeps only the part under the line for the tinted copy', () => {
    expect(submergedClip(0.25)).toBe('inset(75% 0 0 0)');
    expect(submergedClip(1)).toBe('inset(0% 0 0 0)');
  });
});

describe('waterTintFilter()', () => {
  it('turns the picture round to the hue of the water', () => {
    expect(waterTintFilter('#0000ff')).toContain('hue-rotate(201.4deg)');
    expect(waterTintFilter('#00ff00')).toContain('hue-rotate(81.4deg)');
  });

  it('takes the hue of clear water from a colour it cannot read', () => {
    expect(waterTintFilter('teal')).toContain('hue-rotate(156.4deg)');
    expect(waterTintFilter('#808080')).toContain('hue-rotate(156.4deg)');
  });
});
