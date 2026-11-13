import { effectBlowsOf, heldEffectClock, heldMsOf, wallClockOf } from '@axe/domain/effect/effect-blows';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type EffectStage } from '@axe/domain/effect/effect-stage';

function makePreset(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 1000;
  Object.assign(preset, fields);
  return preset;
}

describe('effectBlowsOf()', () => {
  it('strikes the instant a burst goes off, and lands nothing where an effect heals or shields', () => {
    expect(effectBlowsOf(makePreset('burst', 2)).map((blow) => blow.atMs)).toEqual([60]);
    expect(effectBlowsOf(makePreset('heal', 3))).toEqual([]);
    expect(effectBlowsOf(makePreset('barrier', 3))).toEqual([]);
  });

  it('holds longer, shakes harder and throws the target further at the higher grades', () => {
    const [light, middle, heavy] = [1, 2, 3].map((grade) => effectBlowsOf(makePreset('bash', grade))[0]);

    expect([light.holdMs, middle.holdMs, heavy.holdMs]).toEqual([60, 90, 140]);
    expect([light.shake, middle.shake, heavy.shake]).toEqual(['', 'soft', 'hard']);
    expect(light.push).toBeLessThan(middle.push);
    expect(middle.push).toBeLessThan(heavy.push);
  });

  it('strikes as a drawing cut flashes, after its stillness, not at its start', () => {
    const [blow] = effectBlowsOf(makePreset('slash', 2, { slashStyle: 'iai' }));

    expect(blow.atMs).toBeGreaterThan(550);
    expect(blow.atMs).toBeLessThan(650);
  });

  it('strikes once for every stroke of a combination, holding only those far enough apart', () => {
    const blows = effectBlowsOf(makePreset('slash', 3, { slashStyle: 'combo' }));

    expect(blows).toHaveLength(5);
    expect(blows.filter((blow) => blow.holdMs > 0).length).toBeGreaterThan(0);
    expect(heldMsOf(blows)).toBeLessThanOrEqual(300);
  });

  it('strikes as each shot of a volley lands, holding it still at only a few of them', () => {
    const volley = makePreset('projectile', 3, { shots: 12 });
    const blows = effectBlowsOf(volley);

    expect(blows.length).toBeGreaterThan(1);
    expect(heldMsOf(blows)).toBeLessThanOrEqual(300);
    for (const [index, blow] of blows.entries()) {
      if (index > 0) expect(blow.atMs).toBeGreaterThanOrEqual(blows[index - 1].atMs);
    }
  });

  it('strikes where each stage of a run lands that strikes', () => {
    const staged = makePreset('projectile', 2);
    const stages: EffectStage[] = [
      { role: 'travel', kind: 'projectile', durationMs: 400 },
      { role: 'impact', kind: 'burst', durationMs: 300 },
      { role: 'field', kind: 'miasma', durationMs: 1000 },
    ];
    staged.stages = JSON.stringify(stages);

    expect(effectBlowsOf(staged).map((blow) => blow.atMs)).toEqual([418]);
  });
});

describe('effectBlowsOf() for a shot that falls from above', () => {
  it('strikes as the ballistic shot comes down, not as it is fired', () => {
    const [blow] = effectBlowsOf(makePreset('ballistic', 3));

    expect(blow.atMs).toBe(860);
  });
});

describe('heldEffectClock() and wallClockOf()', () => {
  const blows = [
    { atMs: 200, holdMs: 100, shake: '' as const, push: 0.1 },
    { atMs: 500, holdMs: 50, shake: '' as const, push: 0.1 },
  ];

  it('runs with the wall clock up to the first blow, stands still through its hold, and runs on behind', () => {
    expect([0, 150, 200, 250, 299, 300, 400].map((wall) => heldEffectClock(blows, wall))).toEqual([
      0, 150, 200, 200, 200, 200, 300,
    ]);
  });

  it('stands still again at each later blow, as far behind as every hold before it', () => {
    expect([600, 620, 649, 650, 700].map((wall) => heldEffectClock(blows, wall))).toEqual([500, 500, 500, 500, 550]);
  });

  it('finds on the wall clock when a moment of the effect comes, the inverse of the held clock', () => {
    expect([0, 200, 300, 500, 700].map((effect) => wallClockOf(blows, effect))).toEqual([0, 200, 400, 600, 850]);
    for (const effect of [0, 120, 200, 260, 500, 777])
      expect(heldEffectClock(blows, wallClockOf(blows, effect))).toBe(effect);
  });

  it('runs with the wall clock throughout for an effect that lands no blow', () => {
    expect(heldEffectClock([], 1234)).toBe(1234);
    expect(wallClockOf([], 1234)).toBe(1234);
  });
});
