import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { areaShareOf } from '@axe/domain/effect/effect-area';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { effectShakeOf } from '@axe/domain/effect/effect-shake';
import { impactSoundTimes } from '@axe/domain/effect/effect-sound-times';
import { type EffectStage } from '@axe/domain/effect/effect-stage';
import { burstsFromBelow, fallsFromAbove, holyStrikesAt, smiteLookOf } from '@axe/domain/effect/holy-looks';

const CELL = 50;

function makePreset(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 4000;
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
      x: 100 + index * 60,
      y: 0,
      z: 0,
    })),
    seed: 1,
  };
}

describe('smiteLookOf()', () => {
  it('draws a light that smites as a seal, a judgement and the light of heaven, by its grade', () => {
    expect([1, 2, 3].map((grade) => smiteLookOf(makePreset('smite', grade)))).toEqual(['seal', 'judgement', 'heaven']);
  });
});

describe('holyStrikesAt()', () => {
  it('strikes after each light has been seen coming, the greater the later', () => {
    expect(holyStrikesAt('smite', 1, 4)).toBeCloseTo(0.34);
    expect(holyStrikesAt('smite', 2, 4)).toBeCloseTo(0.5);
    expect(holyStrikesAt('smite', 3, 4)).toBeCloseTo(1.1);
    expect(holyStrikesAt('halo', 2, 4)).toBeCloseTo(1);
    expect(holyStrikesAt('sanctuary', 3, 4)).toBeCloseTo(0.9);
  });

  it('strikes within the first half of a playback too short to wait that long', () => {
    for (const [kind, grade] of [
      ['smite', 1],
      ['smite', 2],
      ['smite', 3],
      ['halo', 2],
      ['sanctuary', 3],
    ] as const) {
      const at = holyStrikesAt(kind, grade, 0.6)!;

      expect(at).toBeGreaterThan(0.1);
      expect(at).toBeLessThanOrEqual(0.3);
    }
  });

  it('says nothing of a look of any other kind', () => {
    expect(holyStrikesAt('bolt', 2, 4)).toBeUndefined();
    expect(holyStrikesAt('heal', 2, 4)).toBeUndefined();
  });
});

describe('the blows of holy light', () => {
  it('lands one blow as each strikes, held, shaking and throwing by its grade', () => {
    const seal = effectBlowsOf(makePreset('smite', 1));
    const judgement = effectBlowsOf(makePreset('smite', 2));
    const heaven = effectBlowsOf(makePreset('smite', 3));
    const halo = effectBlowsOf(makePreset('halo', 2));
    const sanctuary = effectBlowsOf(makePreset('sanctuary', 3));

    expect([seal, judgement, heaven, halo, sanctuary].map((blows) => blows.map((blow) => blow.atMs))).toEqual([
      [340],
      [500],
      [1100],
      [1000],
      [900],
    ]);
    expect([seal, judgement, heaven].map(([blow]) => blow.holdMs)).toEqual([60, 90, 140]);
    expect([seal, judgement, heaven].map(([blow]) => blow.shake)).toEqual(['', 'soft', 'hard']);
    expect(seal[0].push).toBeLessThan(heaven[0].push);
    expect(effectShakeOf(makePreset('halo', 2))).toBe('soft');
    expect(effectShakeOf(makePreset('sanctuary', 3))).toBe('hard');
  });

  it('lands the blow of one that is a stage of a run as far into its stage', () => {
    const run = makePreset('burst', 2);
    run.stages = JSON.stringify([
      { role: 'impact', kind: 'burst', durationMs: 1000 },
      { role: 'impact', kind: 'halo', durationMs: 3000 },
    ] satisfies EffectStage[]);

    expect(effectBlowsOf(run).map((blow) => blow.atMs)).toEqual([60, 2000]);
  });

  it('sounds the landing of each as it strikes', () => {
    const judgement = makePreset('smite', 2, { impactSoundIdentifier: 'sound' });
    const sanctuary = makePreset('sanctuary', 3, { impactSoundIdentifier: 'sound' });

    expect(impactSoundTimes(judgement)).toEqual([500]);
    expect(impactSoundTimes(sanctuary)).toEqual([900]);
  });
});

describe('the pieces holy light strikes', () => {
  it('presses a piece a light smites down, whoever cast it and from wherever', () => {
    for (const grade of [1, 2, 3]) {
      const preset = makePreset('smite', grade);
      const at = effectBlowsOf(preset)[0].atMs + 60;
      for (const origin of [{ x: 0, y: 0, z: 0 }, null]) {
        const jolt = effectJoltsOf(preset, cast(origin), at, CELL).get('t0')!;

        expect([grade, jolt.x, jolt.y]).toEqual([grade, 0, 0]);
        expect(jolt.z).toBeLessThan(0);
      }
    }
  });

  it('lifts a piece off the floor as the light of a sanctuary bursts up under it', () => {
    const preset = makePreset('sanctuary', 3);
    const jolt = effectJoltsOf(preset, cast({ x: 0, y: 0, z: 0 }), effectBlowsOf(preset)[0].atMs + 60, CELL).get('t0')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeGreaterThan(0);
  });

  it('throws a piece back from the one who cast a halo as it bursts', () => {
    const preset = makePreset('halo', 2);
    const jolt = effectJoltsOf(preset, cast({ x: 0, y: 0, z: 0 }), effectBlowsOf(preset)[0].atMs + 60, CELL).get('t0')!;

    expect(jolt.x).toBeGreaterThan(0);
    expect(jolt.z).toBe(0);
  });

  it('strikes the pieces a light of heaven or a sanctuary takes in at the same instant as the first', () => {
    for (const name of ['天罰', '聖域']) {
      const preset = createEffectPreset(DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!);
      const at = effectBlowsOf(preset)[0].atMs + 60;
      const jolts = effectJoltsOf(preset, cast(null, 3), at, CELL);

      expect([name, jolts.size]).toEqual([name, 3]);
      expect(jolts.get('t2')!.z).toBeCloseTo(jolts.get('t0')!.z);
      preset.destroy();
    }
  });

  it('takes one that is only a stage of a run as neither falling from above nor bursting from below', () => {
    const run = makePreset('smite', 2);
    run.stages = JSON.stringify([{ role: 'impact', kind: 'smite', durationMs: 2000 }] satisfies EffectStage[]);

    expect(fallsFromAbove(run)).toBe(false);
    expect(burstsFromBelow(run)).toBe(false);
    expect(fallsFromAbove(makePreset('smite', 2))).toBe(true);
    expect(burstsFromBelow(makePreset('sanctuary', 3))).toBe(true);
  });
});

describe('holy light over an area', () => {
  it('is laid out whole over all it takes in, not struck small on each of the rest', () => {
    for (const kind of ['smite', 'sanctuary'] as const) {
      const preset = makePreset(kind, 3, { targeting: 'multi', areaRadius: 3 });

      expect(areaShareOf(preset, cast(null, 3), 1)).toBe(1);
    }
  });
});
