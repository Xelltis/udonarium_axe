import {
  causticOpacity,
  deepWaterColor,
  dirtyWaterColor,
  flowStreakOpacity,
  frozenOver,
  glintOpacity,
  ICE_ALPHA,
  ICE_COLOUR,
  murkAlpha,
  scumOpacity,
  siltColorOf,
  siltOpacity,
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

  it('clouds murky water with silt darker than the water, and none in water clearer than a quarter murky', () => {
    expect(siltOpacity(0.25)).toBe(0);
    expect(siltOpacity(1)).toBeCloseTo(0.55, 6);
    expect(siltColorOf('#3399cc')).not.toBe('#3399cc');
  });

  it('streaks flowing water the more the faster it runs, fainter in murky water, and still water not at all', () => {
    expect(flowStreakOpacity(0, 0)).toBe(0);
    expect(flowStreakOpacity(1, 0)).toBeGreaterThan(flowStreakOpacity(0.2, 0));
    expect(flowStreakOpacity(1, 1)).toBeCloseTo(flowStreakOpacity(1, 0) / 2, 2);
  });

  it('makes murk opaque at the top of the scale', () => {
    expect(murkAlpha(1)).toBe(1);
    expect(murkAlpha(0.5)).toBeGreaterThan(0.3);
    expect(murkAlpha(0.5)).toBeLessThan(0.6);
  });

  it('lays ice over the colour of the water as far as it is frozen, keeping open water as it was', () => {
    const water = [0.2, 0.4, 0.6, 0.5] as const;

    expect(frozenOver(water, 0)).toEqual([0.2, 0.4, 0.6, 0.5]);
    expect(frozenOver(water, 1)).toEqual([...ICE_COLOUR, ICE_ALPHA]);
    expect(frozenOver(water, 2)).toEqual([...ICE_COLOUR, ICE_ALPHA]);
    const half = frozenOver(water, 0.5);
    expect(half[0]).toBeCloseTo((0.2 + ICE_COLOUR[0]) / 2, 3);
    expect(half[3]).toBeCloseTo((0.5 + ICE_ALPHA) / 2, 3);
  });
});
