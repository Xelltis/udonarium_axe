import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';

const CELL = 50;

function makePreset(kind: EffectKind, grade = 2): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 1000;
  return preset;
}

function cast(origin: { x: number; y: number; z: number } | null): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin,
    targets: [{ identifier: 'target', x: 100, y: 0, z: 0 }],
    seed: 1,
  };
}

describe('effectJoltsOf()', () => {
  it('holds the struck piece still as the blow lands, then throws it back away from the one who struck', () => {
    const bash = makePreset('bash');
    const [blow] = effectBlowsOf(bash);
    const from = cast({ x: 0, y: 0, z: 0 });

    expect(effectJoltsOf(bash, from, blow.atMs, CELL).get('target')).toBeUndefined();
    const thrown = effectJoltsOf(bash, from, blow.atMs + 60, CELL).get('target')!;
    expect(thrown.x).toBeGreaterThan(0);
    expect(thrown.y).toBeCloseTo(0);
    expect(effectJoltsOf(bash, from, blow.atMs + 1000, CELL).get('target')).toBeUndefined();
  });

  it('throws the piece further at the higher grades', () => {
    const at = (grade: number) => {
      const preset = makePreset('bash', grade);
      return effectJoltsOf(preset, cast({ x: 0, y: 0, z: 0 }), effectBlowsOf(preset)[0].atMs + 60, CELL).get('target')!
        .x;
    };

    expect(at(1)).toBeLessThan(at(3));
  });

  it('presses a piece struck from no direction down instead', () => {
    const bolt = makePreset('bolt');
    const jolt = effectJoltsOf(bolt, cast(null), effectBlowsOf(bolt)[0].atMs + 60, CELL).get('target')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeLessThan(0);
  });

  it('has the one who strikes lean in towards the target as the effect sets off, and stand back after', () => {
    const slash = makePreset('slash');
    const from = cast({ x: 0, y: 0, z: 0 });

    expect(effectJoltsOf(slash, from, 140, CELL).get('caster')!.x).toBeGreaterThan(0);
    expect(effectJoltsOf(slash, from, 1000, CELL).get('caster')).toBeUndefined();
  });

  it('throws nothing for what neither strikes nor sets off at a target', () => {
    expect(effectJoltsOf(makePreset('heal'), cast({ x: 0, y: 0, z: 0 }), 300, CELL).size).toBe(0);
  });
});
