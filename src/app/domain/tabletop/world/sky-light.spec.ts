import { skyLightAt } from '@axe/domain/tabletop/world/sky-light';

describe('the light of the sky over the table', () => {
  it('raises the sun in the east, stands it high in the south at noon, and sets it in the west', () => {
    const dawn = skyLightAt(0.25);
    const noon = skyLightAt(0.5);
    const dusk = skyLightAt(0.749);

    expect(dawn.direction.x).toBeCloseTo(1, 5);
    expect(dawn.direction.z).toBeCloseTo(0, 5);
    expect(noon.direction.y).toBeCloseTo(Math.cos(Math.PI / 3), 5);
    expect(noon.direction.z).toBeCloseTo(Math.sin(Math.PI / 3), 5);
    expect(dusk.direction.x).toBeLessThan(-0.99);
  });

  it('crosses the sky with the moon through the night, dimmer than the sun and bluer', () => {
    const midnight = skyLightAt(0);
    const noon = skyLightAt(0.5);

    expect(midnight.direction.z).toBeCloseTo(Math.sin(Math.PI / 4), 5);
    expect(midnight.strength).toBeLessThan(noon.strength);
    expect(midnight.colour).not.toBe(noon.colour);
  });

  it('warms the sun while it is low', () => {
    expect(skyLightAt(0.27).colour).not.toBe(skyLightAt(0.5).colour);
  });

  it('gives a level surface as much light at every hour, the sky making up what the sun does not', () => {
    for (const time of [0, 0.1, 0.25, 0.3, 0.5, 0.7, 0.8, 0.99, 1.25, -0.5]) {
      const light = skyLightAt(time);
      expect(light.skyStrength + light.strength * light.direction.z).toBeCloseTo(1, 10);
      expect(Math.hypot(light.direction.x, light.direction.y, light.direction.z)).toBeCloseTo(1, 10);
    }
  });
});
