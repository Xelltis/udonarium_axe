import {
  causticOpacity,
  deepWaterColor,
  dirtyWaterColor,
  glintOpacity,
  murkAlpha,
  scumOpacity,
  underwaterDeepColor,
} from '@axe/domain/tabletop/water/water-look';

describe('the look of water', () => {
  it('draws the depths darker than the water', () => {
    expect(deepWaterColor('#6496c8')).toBe('#203040');
    expect(deepWaterColor('#abc')).toBe('#363c41');
  });

  it('hands a colour it cannot read back as it is', () => {
    expect(deepWaterColor('teal')).toBe('teal');
  });

  it('keeps the blue of the depths under the default light of a map under water', () => {
    expect(underwaterDeepColor('#c8f0ff')).toBe('#06354f');
    expect(underwaterDeepColor('#6496c8')).toBe(deepWaterColor('#6496c8'));
  });

  it('lets less light through murky and deep water onto the floor', () => {
    expect(causticOpacity(0.6, 1)).toBeLessThan(causticOpacity(0.6, 0) * 0.2);
    expect(causticOpacity(0.6, 0, 6)).toBeLessThan(causticOpacity(0.6, 0, 0) * 0.6);
    expect(glintOpacity(0.6, 1)).toBeLessThan(glintOpacity(0.6, 0));
  });

  it('turns dirty water towards the dull brown of silt and rot, and leaves clean water its colour', () => {
    expect(dirtyWaterColor('#3399cc', 0)).toBe('#3399cc');
    expect(dirtyWaterColor('#3399cc', 1)).not.toBe('#3399cc');
    expect(scumOpacity(0)).toBe(0);
    expect(scumOpacity(1)).toBeGreaterThan(0.5);
    expect(glintOpacity(0.6, 0, 1)).toBeLessThan(glintOpacity(0.6, 0, 0) * 0.2);
  });

  it('makes murk opaque at the top of the scale', () => {
    expect(murkAlpha(1)).toBe(1);
    expect(murkAlpha(0.5)).toBeGreaterThan(0.3);
    expect(murkAlpha(0.5)).toBeLessThan(0.6);
  });
});
