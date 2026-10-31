import { clockSky, SKY_HEIGHT, SKY_HORIZON, SKY_WIDTH } from '@axe/features/widgets/game-clock/clock-sky';

describe('clockSky', () => {
  it('raises the sun in the east on the right at six, over the south at noon, and sets it in the west on the left at eighteen', () => {
    const dawn = clockSky(0.25);
    const noon = clockSky(0.5);
    const dusk = clockSky(0.75);
    expect(dawn.body).toBe('sun');
    expect(dawn.sun.y).toBeCloseTo(SKY_HORIZON);
    expect(dawn.sun.x).toBeGreaterThan(SKY_WIDTH / 2);
    expect(noon.sun.x).toBeCloseTo(SKY_WIDTH / 2);
    expect(noon.sun.y).toBeLessThan(SKY_HORIZON - 40);
    expect(dusk.sun.y).toBeCloseTo(SKY_HORIZON);
    expect(dusk.sun.x).toBeLessThan(SKY_WIDTH / 2);
  });

  it('takes the sun on under the horizon at night, to come up in the east again, never back across the sky', () => {
    const steps = [0.25, 0.375, 0.5, 0.625, 0.75].map((at) => clockSky(at).sun.x);
    expect(steps).toEqual([...steps].sort((a, b) => b - a));
    expect(clockSky(0).sun.y).toBeGreaterThan(SKY_HEIGHT);
  });

  it('puts the moon up from dusk to dawn, over the south at midnight, with the stars out', () => {
    const midnight = clockSky(0);
    expect(midnight.body).toBe('moon');
    expect(midnight.moon.x).toBeCloseTo(SKY_WIDTH / 2);
    expect(midnight.moon.y).toBeLessThan(SKY_HORIZON - 40);
    expect(clockSky(0.75).moon.x).toBeGreaterThan(SKY_WIDTH / 2);
    expect(midnight.stars).toBe(1);
    expect(clockSky(0.5).stars).toBe(0);
    expect(clockSky(0.76).stars).toBeGreaterThan(0);
  });

  it('blends the colours between the points of the day either side, the same at midnight from both ends', () => {
    expect(clockSky(0).top).toBe(clockSky(1).top);
    expect(clockSky(0.5).top).toBe('rgb(47, 127, 216)');
    expect(clockSky(0.425).top).not.toBe(clockSky(0.5).top);
  });
});
