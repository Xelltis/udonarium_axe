import { breathSurgeAt, breathTimingOf, isGentleBreath } from '@axe/domain/effect/breath-timing';

describe('breathTimingOf()', () => {
  it('draws the breath in for a quarter of a second, reaches in a moment more and blows for four fifths of its length', () => {
    const timing = breathTimingOf(3.5);

    expect(timing.burstsAt).toBeCloseTo(0.25);
    expect(timing.reachesAt).toBeCloseTo(0.4);
    expect(timing.failsAt).toBeCloseTo(2.8);
    expect(timing.spentAt).toBeCloseTo(3.1);
  });

  it('draws a short breath in for less, and still blows it for a moment', () => {
    const timing = breathTimingOf(0.4);

    expect(timing.burstsAt).toBeCloseTo(0.06);
    expect(timing.failsAt).toBeGreaterThanOrEqual(timing.reachesAt + 0.2);
    expect(timing.spentAt).toBeGreaterThan(timing.failsAt);
  });
});

describe('breathSurgeAt()', () => {
  it('surges between most of its force and all of it, about three times a second, the same for the same seed', () => {
    const forces = Array.from({ length: 300 }, (_unused, index) => breathSurgeAt(index / 100, 7));
    let surges = 0;
    for (let index = 1; index < forces.length - 1; index++) {
      if (forces[index] > forces[index - 1] && forces[index] >= forces[index + 1] && forces[index] > 0.97) surges++;
    }

    expect(Math.min(...forces)).toBeGreaterThanOrEqual(0.85);
    expect(Math.max(...forces)).toBeLessThanOrEqual(1);
    expect(Math.max(...forces) - Math.min(...forces)).toBeGreaterThan(0.08);
    expect(surges).toBeGreaterThanOrEqual(6);
    expect(surges).toBeLessThanOrEqual(12);
    expect(breathSurgeAt(1.23, 7)).toBe(breathSurgeAt(1.23, 7));
  });
});

describe('isGentleBreath()', () => {
  it('takes a breath of the family that heals, and of the holy one, as the gentle one', () => {
    expect(isGentleBreath({ tagName: ' 回復 ' })).toBe(true);
    expect(isGentleBreath({ tagName: '聖' })).toBe(true);
    expect(isGentleBreath({ tagName: '炎' })).toBe(false);
    expect(isGentleBreath({ tagName: '' })).toBe(false);
  });
});
