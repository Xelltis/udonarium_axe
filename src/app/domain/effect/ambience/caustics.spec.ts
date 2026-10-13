import { causticAlpha, causticAt, causticFieldOf } from '@axe/domain/effect/ambience/caustics';

describe('the net of light under water', () => {
  const field = causticFieldOf(7, 96);

  it('draws the same net from the same seed', () => {
    expect(causticAlpha(causticFieldOf(7, 96))).toEqual(causticAlpha(field));
    expect(causticAlpha(causticFieldOf(8, 96))).not.toEqual(causticAlpha(field));
  });

  it('repeats without a seam across either edge of the tile', () => {
    for (const [x, y] of [
      [0, 10],
      [3.5, 40],
      [50, 0],
      [95, 95],
    ]) {
      expect(causticAt(field, x + 96, y)).toBeCloseTo(causticAt(field, x, y), 6);
      expect(causticAt(field, x, y + 96)).toBeCloseTo(causticAt(field, x, y), 6);
    }
  });

  it('lights lines across a dark floor rather than the whole of it', () => {
    const alpha = causticAlpha(field);
    const lit = alpha.filter((value) => value > 64).length / alpha.length;
    expect(lit).toBeGreaterThan(0.03);
    expect(lit).toBeLessThan(0.4);
    expect(Math.max(...alpha)).toBeGreaterThan(200);
  });
});
