import {
  cloudAlpha,
  scumAlpha,
  scumRimAlpha,
  smoothFieldAt,
  smoothFieldOf,
  streakAlpha,
} from '@axe/domain/effect/ambience/water-patterns';

describe('the patterns on water', () => {
  const field = smoothFieldOf(11, 64, 20, 6);

  it('repeats without a seam across either edge of the tile', () => {
    for (const [x, y] of [
      [0, 3],
      [10.5, 40],
      [63, 63],
    ]) {
      expect(smoothFieldAt(field, x + 64, y)).toBeCloseTo(smoothFieldAt(field, x, y), 6);
      expect(smoothFieldAt(field, x, y + 64)).toBeCloseTo(smoothFieldAt(field, x, y), 6);
    }
  });

  it('draws the same pattern from the same seed', () => {
    expect(scumAlpha(smoothFieldOf(11, 64, 20, 6))).toEqual(scumAlpha(field));
  });

  it('lays scum over about as much of the water as it is asked to', () => {
    const covered = (coverage: number) => {
      const alpha = scumAlpha(field, coverage);
      return alpha.filter((value) => value > 0).length / alpha.length;
    };
    expect(covered(0.3)).toBeGreaterThan(0.25);
    expect(covered(0.3)).toBeLessThan(0.4);
    expect(covered(0.6)).toBeGreaterThan(covered(0.3));
  });

  it('draws the rim of the scum as a thin line rather than a patch', () => {
    const rim = scumRimAlpha(field, 0.3);
    const lit = rim.filter((value) => value > 32).length / rim.length;
    expect(lit).toBeGreaterThan(0.01);
    expect(lit).toBeLessThan(0.15);
  });

  it('spreads the clouds of silt over all of the water, thicker in places', () => {
    const alpha = cloudAlpha(smoothFieldOf(5, 64, 16, 3));
    expect(Math.max(...alpha)).toBe(255);
    expect(Math.min(...alpha)).toBe(0);
  });

  it('draws the streaks of a current as thin lines along the tile that meet themselves across its edges', () => {
    const size = 64;
    const alpha = streakAlpha(3, size);
    const lit = alpha.filter((value) => value > 32).length / alpha.length;
    expect(lit).toBeGreaterThan(0.03);
    expect(lit).toBeLessThan(0.35);
    // Down a column the lines are crossed; along a row they run on, so a row changes far less from pixel to pixel.
    let across = 0;
    let along = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        along += Math.abs(alpha[y * size + x] - alpha[y * size + ((x + 1) % size)]);
        across += Math.abs(alpha[y * size + x] - alpha[((y + 1) % size) * size + x]);
      }
    }
    expect(along).toBeLessThan(across / 2);
    expect(streakAlpha(3, size)).toEqual(alpha);
  });
});
