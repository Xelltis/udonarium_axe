import {
  fallsInScene,
  MAX_WEATHER_FALL,
  weatherFallCount,
  weatherFallOf,
  weatherFallSeeds,
  weatherFallSpanPx,
  weatherFallSquarePx,
} from '@axe/domain/tabletop/world/weather-fall';

describe('the weather falling through the scene', () => {
  it('lets rain, a storm and snow fall, and nothing else', () => {
    expect(['rain', 'storm', 'snow'].map((kind) => fallsInScene(kind as never))).toEqual([true, true, true]);
    expect(['fog', 'ash', 'underwater'].map((kind) => fallsInScene(kind as never))).toEqual([false, false, false]);
    expect(weatherFallOf('fog', '#ffffff', 1)).toBeNull();
  });

  it('falls as thick as it is laid, and not at all laid at nothing', () => {
    const thin = weatherFallOf('rain', '#aabbcc', 0.25)!;
    const thick = weatherFallOf('rain', '#aabbcc', 1)!;

    expect(thick.perMegapixel).toBeCloseTo(thin.perMegapixel * 4, 6);
    expect(weatherFallOf('rain', '#aabbcc', 0)).toBeNull();
    expect(thick.colour).toBe('#aabbcc');
  });

  it('streaks rain down fast, flashes in a storm, and lets snow sway down slowly', () => {
    const rain = weatherFallOf('rain', '#ffffff', 1)!;
    const storm = weatherFallOf('storm', '#ffffff', 1)!;
    const snow = weatherFallOf('snow', '#ffffff', 1)!;

    expect([rain.shape, storm.shape, snow.shape]).toEqual(['streak', 'streak', 'flake']);
    expect([rain.flashes, storm.flashes, snow.flashes]).toEqual([false, true, false]);
    expect(Math.abs(snow.velocity.z)).toBeLessThan(Math.abs(rain.velocity.z) / 10);
    expect(snow.swayPx).toBeGreaterThan(0);
  });

  it('drops more over a wider square, never more than the scene draws at once', () => {
    const rain = weatherFallOf('rain', '#ffffff', 1)!;

    expect(weatherFallCount(rain, 2000)).toBe(weatherFallCount(rain, 1000) * 4);
    expect(weatherFallCount(rain, 100_000)).toBe(MAX_WEATHER_FALL);
    expect(weatherFallCount(rain, 0)).toBe(0);
  });

  it('keeps them falling over a square as wide as the camera takes in, in steps that double', () => {
    expect(weatherFallSpanPx(600)).toBe(1024);
    expect(weatherFallSpanPx(700)).toBe(2048);
    expect(weatherFallSpanPx(10)).toBe(256);
    expect(weatherFallSpanPx(1e9)).toBe(8192);
    expect(weatherFallSquarePx(1100)).toBe(2048);
    expect(weatherFallSquarePx(1024)).toBe(1024);
  });

  it('starts the same drops in the same places on every screen', () => {
    const seeds = weatherFallSeeds(3);

    expect(seeds).toHaveLength(12);
    expect([...weatherFallSeeds(3)]).toEqual([...seeds]);
    expect([...seeds].every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
