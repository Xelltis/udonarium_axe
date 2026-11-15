import { GRACE_RISES_AT, GRACE_SETS_DOWN_AT } from '@axe/domain/effect/blessing-looks';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';

const CELL = 50;
const DURATION = 3000;

function makePreset(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = DURATION;
  preset.staggerMs = 150;
  Object.assign(preset, fields);
  return preset;
}

const cast: EffectCast = {
  presetIdentifier: 'preset',
  casterIdentifier: 'caster',
  origin: { x: 0, y: 0, z: 0 },
  targets: [
    { identifier: 'first', x: 100, y: 0, z: 0 },
    { identifier: 'second', x: 200, y: 0, z: 0 },
  ],
  seed: 1,
};

describe('how the pieces bear a grace', () => {
  const grace = makePreset('heal', 3);
  const rises = DURATION * GRACE_RISES_AT;
  const setsDown = DURATION * GRACE_SETS_DOWN_AT;

  it('leaves them on the floor until its dome is raised', () => {
    expect(effectJoltsOf(grace, cast, rises - 20, CELL).size).toBe(0);
  });

  it('lifts every one of them straight up off the floor at once, and holds them there', () => {
    const held = effectJoltsOf(grace, cast, (rises + setsDown) / 2, CELL);

    for (const identifier of ['first', 'second']) {
      const jolt = held.get(identifier)!;
      expect(jolt.x).toBe(0);
      expect(jolt.y).toBe(0);
      expect(jolt.z).toBeGreaterThan(CELL * 0.15);
      expect(jolt.z).toBeLessThan(CELL * 0.26);
    }
    expect(held.get('caster')).toBeUndefined();
  });

  it('sets them down as it opens, and has let go of them soon after', () => {
    const high = effectJoltsOf(grace, cast, setsDown, CELL).get('first')!.z;
    const lower = effectJoltsOf(grace, cast, setsDown + 350, CELL).get('first')!.z;

    expect(lower).toBeLessThan(high);
    expect(lower).toBeGreaterThan(0);
    expect(effectJoltsOf(grace, cast, joltsEndOf(grace, cast, effectBlowsOf(grace)), CELL).size).toBe(0);
  });

  it('lifts no one for a lesser healing, a cleansing or a barrier', () => {
    const at = (rises + setsDown) / 2;

    for (const preset of [
      makePreset('heal', 2),
      makePreset('heal', 1),
      makePreset('heal', 3, { moteStyle: 'cleanse' }),
      makePreset('barrier', 3),
      makePreset('aura', 2),
    ]) {
      expect(effectJoltsOf(preset, cast, at, CELL).size).toBe(0);
    }
  });
});

describe('how a piece bears the greatest aura', () => {
  const aura = makePreset('aura', 3);
  const blows = effectBlowsOf(aura);
  const breaksOut = blows[0].atMs;

  it('trembles where it stands as the power gathers, more and more, and is not yet off the floor', () => {
    const reachAt = (ms: number) => {
      let most = 0;
      for (let at = ms - 40; at <= ms; at += 4) {
        const jolt = effectJoltsOf(aura, cast, at, CELL, blows).get('first')!;
        expect(jolt.z).toBe(0);
        most = Math.max(most, Math.hypot(jolt.x, jolt.y));
      }
      return most;
    };

    expect(reachAt(breaksOut * 0.4)).toBeGreaterThan(0);
    expect(reachAt(breaksOut * 0.95)).toBeGreaterThan(reachAt(breaksOut * 0.4));
    expect(reachAt(breaksOut * 0.95)).toBeLessThan(CELL * 0.04);
  });

  it('is borne up off the floor as it breaks out, and is down again by the end', () => {
    const borne = effectJoltsOf(aura, cast, breaksOut + 400, CELL, blows).get('first')!;

    expect(borne.x).toBe(0);
    expect(borne.z).toBeGreaterThan(CELL * 0.1);
    expect(effectJoltsOf(aura, cast, DURATION - 60, CELL, blows).get('first')!.z).toBeLessThan(borne.z * 0.2);
    expect(effectJoltsOf(aura, cast, DURATION, CELL, blows).size).toBe(0);
  });
});
