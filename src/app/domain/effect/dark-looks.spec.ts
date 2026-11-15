import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { darkLetsGoAt } from '@axe/domain/effect/dark-reaction';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';

const CELL = 50;

function makePreset(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 5000;
  Object.assign(preset, fields);
  return preset;
}

function cast(origin: { x: number; y: number; z: number } | null, targets = 1): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin,
    targets: Array.from({ length: targets }, (_unused, index) => ({
      identifier: `t${index}`,
      x: 200 + index * 100,
      y: 0,
      z: 0,
    })),
    seed: 1,
  };
}

describe('darkStrikesAt()', () => {
  it('strikes a draining as it hooks and as it snaps', () => {
    expect(darkStrikesAt('drain', 2, 5)).toEqual([0.42, 2.02]);
  });

  it('strikes within a playback too short to wait that long, in the same order', () => {
    const strikes = darkStrikesAt('drain', 2, 0.6)!;

    expect(Math.max(...strikes)).toBeLessThan(0.6 * 0.75);
    expect([...strikes].sort((a, b) => a - b)).toEqual(strikes);
  });

  it('has nothing to say of a look of any other kind', () => {
    expect(darkStrikesAt('burst', 2, 3)).toBeUndefined();
  });
});

describe('how the pieces bear a look of darkness', () => {
  const from = { x: 0, y: 0, z: 30 };

  it('drags a drained piece towards the one who drains it for as long as it is held, harder at each beat', () => {
    const drain = makePreset('drain', 2, { durationMs: 3239 });
    const [hooks, snaps] = effectBlowsOf(drain).map((blow) => blow.atMs);
    const pulledAt = (ms: number) => -(effectJoltsOf(drain, cast(from), ms, CELL).get('t0')?.x ?? 0);

    expect(pulledAt(hooks + 700)).toBeGreaterThan(0);
    expect(pulledAt(snaps - 100)).toBeGreaterThan(0);
    expect(pulledAt(hooks + 600 + 80)).toBeGreaterThan(pulledAt(hooks + 600 + 500));
    expect(effectJoltsOf(drain, cast(from), joltsEndOf(drain, cast(from), effectBlowsOf(drain)), CELL).size).toBe(0);
  });

  it('holds no piece for a look of any other kind, nor for one that is a stage of a run', () => {
    const burst = makePreset('burst', 2);

    expect(darkLetsGoAt(burst, effectBlowsOf(burst))).toBe(0);
  });
});
