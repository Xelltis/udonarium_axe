import { skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { skyLightAt } from '@axe/domain/tabletop/world/sky-light';

describe('the sky drawn over a table', () => {
  it('is blue and starless at noon, with the sun high in the south and the moon below the ground', () => {
    const noon = skyDomeAt(0.5);

    expect(noon.zenith).toBe('#3b7bd0');
    expect(noon.stars).toBe(0);
    expect(noon.glowStrength).toBe(0);
    expect(noon.sun.z).toBeGreaterThan(0.8);
    expect(noon.sun.y).toBeGreaterThan(0.4);
    expect(noon.moon.z).toBeLessThan(0);
  });

  it('is dark and full of stars at midnight, with the moon up', () => {
    const midnight = skyDomeAt(0);

    expect(midnight.zenith).toBe('#060a18');
    expect(midnight.stars).toBe(1);
    expect(midnight.moon.z).toBeGreaterThan(0.6);
  });

  it('glows warm round a sun on the horizon, between night and day', () => {
    const dusk = skyDomeAt(0.75);

    expect(dusk.glowStrength).toBeGreaterThan(0.9);
    expect(dusk.horizon).toBe('#e9a06e');
    expect(Math.abs(dusk.sun.z)).toBeLessThan(0.01);
  });

  it('glows paler and golder round the sun rising than round the sun setting', () => {
    const dawn = skyDomeAt(0.25);
    const dusk = skyDomeAt(0.75);
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);

    expect(dawn.glowStrength).toBeGreaterThan(0.9);
    expect(dawn.horizon).not.toBe(dusk.horizon);
    expect(red(dawn.horizon) - blue(dawn.horizon)).toBeLessThan(red(dusk.horizon) - blue(dusk.horizon));
    expect(blue(dawn.zenith)).toBeGreaterThan(blue(dusk.zenith));
  });

  it('puts the sun and the moon where the light of the sky comes from', () => {
    for (const hour of [9, 12, 15]) {
      const light = skyLightAt(hour / 24).direction;
      const sun = skyDomeAt(hour / 24).sun;
      expect(sun.x).toBeCloseTo(light.x, 3);
      expect(sun.y).toBeCloseTo(light.y, 3);
      expect(sun.z).toBeCloseTo(light.z, 3);
    }
    const moon = skyDomeAt(1 / 24).moon;
    const light = skyLightAt(1 / 24).direction;
    expect(moon.z).toBeCloseTo(light.z, 3);
  });
});
