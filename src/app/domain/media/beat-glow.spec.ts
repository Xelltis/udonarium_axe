import { beatGlow } from '@axe/domain/media/beat-glow';

describe('beatGlow()', () => {
  const grid = { bpm: 120, bar: 0 };

  it('shines brightest as a bar starts, less on its other beats, and fades between', () => {
    expect(beatGlow(grid, 0)).toBeCloseTo(1, 9);
    expect(beatGlow(grid, 0.5)).toBeCloseTo(0.6, 9);
    expect(beatGlow(grid, 0.25)).toBeCloseTo(Math.exp(-2.5), 9);
    expect(beatGlow(grid, 0.49)).toBeLessThan(0.01);
  });

  it('comes round to the bar again four beats on, and before the first bar too', () => {
    expect(beatGlow(grid, 2)).toBeCloseTo(1, 9);
    expect(beatGlow(grid, -2)).toBeCloseTo(1, 9);
    expect(beatGlow(grid, -0.5)).toBeCloseTo(0.6, 9);
  });

  it('glows on every other beat when the beats come faster than three a second', () => {
    const fast = { bpm: 200, bar: 0 };

    expect(beatGlow(fast, 0.3)).toBeLessThan(0.1);
    expect(beatGlow(fast, 0.6)).toBeCloseTo(0.6, 9);
    expect(beatGlow(fast, 1.2)).toBeCloseTo(1, 9);
  });

  it('glows on every beat at three beats a second', () => {
    expect(beatGlow({ bpm: 180, bar: 0 }, 1 / 3)).toBeCloseTo(0.6, 9);
  });
});
