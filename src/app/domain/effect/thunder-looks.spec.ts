import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import {
  boltLookOf,
  boltStrokesOf,
  CURRENT_BREAKS_AT,
  CURRENT_REACHES_AT,
  isLightning,
  stormEndsAt,
} from '@axe/domain/effect/thunder-looks';

describe('boltLookOf()', () => {
  it('draws a bolt as a snap, a strike and a storm by its grade', () => {
    expect(boltLookOf({ gradeLevel: 1 })).toBe('snap');
    expect(boltLookOf({ gradeLevel: 2 })).toBe('strike');
    expect(boltLookOf({ gradeLevel: 3 })).toBe('storm');
  });

  it('draws the three bundled bolts as the three of them', () => {
    const lookOf = (name: string) => {
      const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.name === name)!;
      return boltLookOf({ gradeLevel: seed.grade as 1 | 2 | 3 });
    };

    expect([lookOf('電撃'), lookOf('落雷'), lookOf('雷帝')]).toEqual(['snap', 'strike', 'storm']);
  });
});

describe('boltStrokesOf()', () => {
  it('strikes once after a leader that is longer the greater the bolt', () => {
    const [snap] = boltStrokesOf(1, 1.332);
    const [strike] = boltStrokesOf(2, 1.567);
    const [storm] = boltStrokesOf(3, 3.048);

    expect(snap).toBeCloseTo(0.08);
    expect(strike).toBeCloseTo(0.2);
    expect(storm).toBeCloseTo(0.55);
    expect(boltStrokesOf(1, 1.332)).toHaveLength(1);
    expect(boltStrokesOf(2, 1.567)).toHaveLength(1);
  });

  it('ends a storm in a second stroke a second after the first, with thunder left to roll after it', () => {
    const [first, last] = boltStrokesOf(3, 3.048);

    expect(last - first).toBeCloseTo(1);
    expect(last).toBeLessThan(3.048 * 0.6);
    expect(stormEndsAt(3.048, first)).toBe(last);
  });

  it('keeps every stroke within a playback too short for its leader', () => {
    for (const grade of [1, 2, 3] as const) {
      const strokes = boltStrokesOf(grade, 0.4);

      expect(strokes[0]).toBeGreaterThan(0);
      expect(strokes.at(-1)!).toBeLessThan(0.4);
      expect([...strokes].sort((a, b) => a - b)).toEqual(strokes);
    }
  });
});

describe('a current of lightning', () => {
  it('reaches its target early in its playback and lets go of it well before the end', () => {
    expect(CURRENT_REACHES_AT).toBeLessThan(0.2);
    expect(CURRENT_BREAKS_AT).toBeGreaterThan(0.6);
    expect(CURRENT_BREAKS_AT).toBeLessThan(1);
  });
});

describe('isLightning()', () => {
  it('is a bolt or a current on its own, not a run of stages nor a shot that lands in one', () => {
    expect(isLightning({ isStaged: false, effectKind: 'bolt' })).toBe(true);
    expect(isLightning({ isStaged: false, effectKind: 'arc' })).toBe(true);
    expect(isLightning({ isStaged: true, effectKind: 'bolt' })).toBe(false);
    expect(isLightning({ isStaged: false, effectKind: 'projectile' })).toBe(false);
  });
});
