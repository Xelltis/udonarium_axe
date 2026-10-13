import { WATER_PRESETS, waterPresetNamed, waterPresetOf } from '@axe/domain/tabletop/water/water-presets';

describe('the looks water can be given', () => {
  it('tells which look water has from its colour, murkiness, dirt and leaves', () => {
    for (const preset of WATER_PRESETS) {
      expect(waterPresetOf(preset.color, preset.turbidity, preset.dirt, preset.leaves)).toBe(preset.id);
    }
  });

  it('crowds a lotus pond with floating leaves, and leaves every other look bare', () => {
    expect(waterPresetNamed('lotus')?.leaves).toBeGreaterThan(0.3);
    for (const preset of WATER_PRESETS.filter((candidate) => candidate.id !== 'lotus')) {
      expect(preset.leaves).toBe(0);
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
