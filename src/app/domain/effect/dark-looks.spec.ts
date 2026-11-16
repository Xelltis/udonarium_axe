import {
  darkSoundsAt,
  darkStrikesAt,
  fallsAsEclipse,
  orbLookOf,
  shadowLookOf,
  stabsFromBelow,
} from '@axe/domain/effect/dark-looks';
import { addDarkJolts, darkLetsGoAt } from '@axe/domain/effect/dark-reaction';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';
import { impactSoundTimes } from '@axe/domain/effect/effect-sound-times';

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

describe('the looks of darkness', () => {
  it('draws what rises out of a shadow as spikes below the highest grade and as a mire of hands at it', () => {
    expect([1, 2, 3].map((grade) => shadowLookOf(makePreset('shadow', grade)))).toEqual(['spike', 'spike', 'abyss']);
  });

  it('draws a black sun as a sphere below the highest grade and as an eclipse at it', () => {
    expect([1, 2, 3].map((grade) => orbLookOf(makePreset('darkorb', grade)))).toEqual(['orb', 'orb', 'eclipse']);
  });
});

describe('darkStrikesAt()', () => {
  it('strikes once each look has been seen coming, and a mire and a draining twice', () => {
    expect(darkStrikesAt('shadow', 1, 5)).toEqual([0.5]);
    expect(darkStrikesAt('shadow', 3, 5)).toEqual([1, 2.95]);
    expect(darkStrikesAt('darkorb', 2, 5)).toEqual([1.74]);
    expect(darkStrikesAt('darkorb', 3, 5)).toEqual([2.62]);
    expect(darkStrikesAt('drain', 2, 5)).toEqual([0.42, 2.02]);
  });

  it('strikes within a playback too short to wait that long, in the same order', () => {
    for (const [kind, grade] of [
      ['shadow', 1],
      ['shadow', 3],
      ['darkorb', 2],
      ['darkorb', 3],
      ['drain', 2],
    ] as const) {
      const strikes = darkStrikesAt(kind, grade, 0.6)!;

      expect(Math.max(...strikes)).toBeLessThan(0.6 * 0.75);
      expect([...strikes].sort((a, b) => a - b)).toEqual(strikes);
    }
  });

  it('has nothing to say of a look of any other kind', () => {
    expect(darkStrikesAt('burst', 2, 3)).toBeUndefined();
    expect(darkSoundsAt('burst', 2, 3)).toBeUndefined();
  });
});

describe('the sound of a look of darkness landing', () => {
  it('sounds as the look first strikes', () => {
    for (const [kind, grade] of [
      ['shadow', 1],
      ['shadow', 3],
      ['darkorb', 2],
      ['darkorb', 3],
    ] as const) {
      const preset = makePreset(kind, grade, { impactSoundIdentifier: 'sound' });

      expect(impactSoundTimes(preset)).toEqual([effectBlowsOf(preset)[0].atMs]);
    }
  });

  it('leaves the landing of a draining where it was', () => {
    expect(darkSoundsAt('drain', 2, 3)).toBeUndefined();
  });
});

describe('how the pieces bear a look of darkness', () => {
  const from = { x: 0, y: 0, z: 30 };

  it('lifts a piece spikes stab up under, and presses down one an eclipse flares over', () => {
    const spikes = makePreset('shadow', 1);
    const eclipse = makePreset('darkorb', 3);

    expect(stabsFromBelow(spikes)).toBe(true);
    expect(stabsFromBelow(makePreset('shadow', 3))).toBe(false);
    expect(fallsAsEclipse(eclipse)).toBe(true);
    expect(fallsAsEclipse(makePreset('darkorb', 2))).toBe(false);
    expect(effectJoltsOf(spikes, cast(from), effectBlowsOf(spikes)[0].atMs + 120, CELL).get('t0')!.z).toBeGreaterThan(
      0
    );
    const pressed = effectJoltsOf(eclipse, cast(from), effectBlowsOf(eclipse)[0].atMs + 160, CELL).get('t0')!;
    expect(pressed.z).toBeLessThan(0);
  });

  it('drags a drained piece towards the one who drains it for as long as it is held, harder at each beat', () => {
    const drain = makePreset('drain', 2, { durationMs: 3239 });
    const [hooks, snaps] = effectBlowsOf(drain).map((blow) => blow.atMs);
    const pulledAt = (ms: number) => -(effectJoltsOf(drain, cast(from), ms, CELL).get('t0')?.x ?? 0);

    expect(pulledAt(hooks + 700)).toBeGreaterThan(0);
    expect(pulledAt(snaps - 100)).toBeGreaterThan(0);
    expect(pulledAt(hooks + 600 + 80)).toBeGreaterThan(pulledAt(hooks + 600 + 500));
    expect(effectJoltsOf(drain, cast(from), joltsEndOf(drain, cast(from), effectBlowsOf(drain)), CELL).size).toBe(0);
  });

  it('sinks a piece a mire has seized until the mire shuts, and draws those about its middle in', () => {
    const mire = makePreset('shadow', 3, { areaRadius: 3, targeting: 'multi', maxTargets: 8 });
    const [seizes, shuts] = effectBlowsOf(mire).map((blow) => blow.atMs);
    const held = effectJoltsOf(mire, cast(from, 2), (seizes + shuts) / 2, CELL);

    expect(held.get('t0')!.z).toBeLessThan(0);
    expect(held.get('t1')!.z).toBeLessThan(0);
    expect(held.get('t1')!.x).toBeLessThan(0);
    expect(effectJoltsOf(mire, cast(from, 2), seizes - 50, CELL).get('t0')).toBeUndefined();
  });

  it('shakes a piece a sphere holds harder as it closes, and holds none once it has burst', () => {
    const orb = makePreset('darkorb', 2);
    const blows = effectBlowsOf(orb);
    const moved = (ms: number) => {
      let far = 0;
      for (let at = ms; at < ms + 60; at += 5) {
        const jolt = { x: 0, y: 0, z: 0 };
        addDarkJolts(orb, cast(from), at, CELL, blows, (_id, by) => Object.assign(jolt, by));
        far = Math.max(far, Math.hypot(jolt.x, jolt.y));
      }
      return far;
    };

    expect(moved(blows[0].atMs - 100)).toBeGreaterThan(moved(blows[0].atMs * 0.4));
    expect(darkLetsGoAt(orb, blows)).toBeGreaterThan(blows[0].atMs);
    expect(moved(darkLetsGoAt(orb, blows) + 10)).toBe(0);
  });

  it('holds no piece for a look of any other kind, nor for one that is a stage of a run', () => {
    const burst = makePreset('burst', 2);

    expect(darkLetsGoAt(burst, effectBlowsOf(burst))).toBe(0);
  });
});
