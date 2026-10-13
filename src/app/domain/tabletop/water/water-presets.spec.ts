import { WATER_PRESETS, waterPresetNamed, waterPresetOf } from '@axe/domain/tabletop/water/water-presets';

describe('the looks water can be given', () => {
  it('tells which look water has from its colour, murkiness and dirt', () => {
    for (const preset of WATER_PRESETS) {
      expect(waterPresetOf(preset.color, preset.turbidity, preset.dirt)).toBe(preset.id);
    }
  });

  it('reads water changed by hand as none of them', () => {
    expect(waterPresetOf('#8a6a3f', 0.4, 0.25)).toBeNull();
  });

  it('starts from clear water of water\\u2019s own colour', () => {
    expect(waterPresetOf('', 0.15, 0)).toBe('clear');
  });

  it('makes muddy and milky water opaque, and weed and stagnant water dirty', () => {
    expect(waterPresetNamed('mud')?.turbidity).toBe(1);
    expect(waterPresetNamed('milky')?.turbidity).toBe(1);
    expect(waterPresetNamed('algae')?.dirt).toBeGreaterThan(0.5);
    expect(waterPresetNamed('stagnant')?.dirt).toBe(1);
    expect(waterPresetNamed('lava')).toBeNull();
  });
});
