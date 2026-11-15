import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';
import { crushLetsGoAt, gravityLookOf, spaceBeatAt, spaceStrikesAt, warpLookOf } from '@axe/domain/effect/space-looks';

const CELL = 50;

function spacePresetOf(
  kind: 'warp' | 'gravity',
  grade: number,
  durationMs: number,
  fields: Partial<EffectPreset> = {}
): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = durationMs;
  preset.staggerMs = 120;
  Object.assign(preset, fields);
  return preset;
}

/** A cast on some points from a caster at a point. */
function castOn(points: readonly { x: number; y: number }[], origin = { x: 50, y: 300 }): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { ...origin, z: 30 },
    targets: points.map((point, index) => ({ identifier: `t${index}`, ...point, z: 0 })),
    seed: 5,
  };
}

function joltOf(preset: EffectPreset, cast: EffectCast, ms: number, identifier = 't0') {
  return effectJoltsOf(preset, cast, ms, CELL).get(identifier) ?? { x: 0, y: 0, z: 0 };
}

describe('the looks of space and time', () => {
  it('tells a blink from a summoning and a crush from a singularity by grade', () => {
    expect(warpLookOf({ gradeLevel: 1 })).toBe('blink');
    expect(warpLookOf({ gradeLevel: 2 })).toBe('blink');
    expect(warpLookOf({ gradeLevel: 3 })).toBe('summon');
    expect(gravityLookOf({ gradeLevel: 2 })).toBe('crush');
    expect(gravityLookOf({ gradeLevel: 3 })).toBe('singularity');
  });

  it('times each beat to its sound, and to a share of a shorter playback', () => {
    expect(spaceBeatAt('blink', 1.411)).toBeCloseTo(0.86, 5);
    expect(spaceBeatAt('summon', 3.553)).toBeCloseTo(1.92, 5);
    expect(spaceBeatAt('crush', 1.855)).toBeCloseTo(0.58, 5);
    expect(spaceBeatAt('singularity', 3.788)).toBeCloseTo(1.5, 5);
    expect(spaceBeatAt('singularity', 1)).toBeCloseTo(0.4, 5);
    expect(crushLetsGoAt(1.855)).toBeGreaterThan(spaceBeatAt('crush', 1.855) + 0.4);
  });

  it('strikes with gravity alone, as a crush comes down and as a singularity falls in', () => {
    expect(spaceStrikesAt('warp', 3, 3.553)).toBeUndefined();
    expect(spaceStrikesAt('gravity', 2, 1.855)).toEqual([0.58]);
    expect(effectBlowsOf(spacePresetOf('warp', 1, 1411))).toEqual([]);
    expect(effectBlowsOf(spacePresetOf('gravity', 2, 1855))).toEqual([
      { atMs: 580, holdMs: 90, shake: 'soft', push: 0.1 },
    ]);
    expect(effectBlowsOf(spacePresetOf('gravity', 3, 3788))[0]).toMatchObject({
      atMs: 1500,
      holdMs: 140,
      shake: 'hard',
    });
  });

  it('sounds the landing of gravity as it strikes', () => {
    const crush = spacePresetOf('gravity', 2, 1855);

    expect(crush.impactSoundAt * crush.duration).toBeCloseTo(580, 0);
  });
});

describe('how the pieces bear the looks of space and time', () => {
  it('draws a blinked piece up off the floor as the seam snaps shut, and drops it back', () => {
    const blink = spacePresetOf('warp', 1, 1411);
    const cast = castOn([{ x: 400, y: 300 }]);

    expect(joltOf(blink, cast, 905).z).toBeGreaterThan(CELL * 0.15);
    expect(joltOf(blink, cast, 300).z).toBeLessThan(CELL * 0.02);
    expect(effectJoltsOf(blink, cast, 1300, CELL).size).toBe(0);
  });

  it('bears a summoned piece up as what is called arrives, and sets it down again', () => {
    const summon = spacePresetOf('warp', 3, 3553);
    const cast = castOn([{ x: 400, y: 300 }]);

    expect(joltOf(summon, cast, 1000).z).toBe(0);
    expect(joltOf(summon, cast, 2200).z).toBeGreaterThan(CELL * 0.18);
    const end = joltsEndOf(summon, cast, effectBlowsOf(summon));
    expect(joltOf(summon, cast, end - 20).z).toBeLessThan(1);
    expect(effectJoltsOf(summon, cast, end, CELL).size).toBe(0);
  });

  it('presses a crushed piece down from the moment the lens comes down until it lets go', () => {
    const crush = spacePresetOf('gravity', 2, 1855);
    const cast = castOn([{ x: 400, y: 300 }]);
    const letsGo = crushLetsGoAt(1.855) * 1000;

    expect(joltOf(crush, cast, 500).z).toBeGreaterThan(0);
    expect(joltOf(crush, cast, 700).z).toBeLessThan(-CELL * 0.1);
    expect(joltOf(crush, cast, letsGo - 50).z).toBeLessThan(-CELL * 0.1);
    expect(effectJoltsOf(crush, cast, letsGo + 400, CELL).size).toBe(0);
  });

  it('crushes every piece it is cast on, each on its own clock', () => {
    const crush = spacePresetOf('gravity', 2, 1855, { staggerMs: 100 });
    const cast = castOn([
      { x: 400, y: 300 },
      { x: 600, y: 300 },
    ]);

    expect(joltOf(crush, cast, 750, 't1').z).toBeLessThan(-CELL * 0.1);
  });

  it('drags the pieces a singularity takes in towards it, lifts the one under it, and throws them out from it as it falls in', () => {
    const singularity = spacePresetOf('gravity', 3, 3788, { areaRadius: 3, targeting: 'multi', maxTargets: 8 });
    const cast = castOn(
      [
        { x: 400, y: 300 },
        { x: 500, y: 300 },
      ],
      { x: 900, y: 300 }
    );

    expect(joltOf(singularity, cast, 1450, 't1').x).toBeLessThan(-CELL * 0.1);
    expect(joltOf(singularity, cast, 1350, 't0').z).toBeGreaterThan(CELL * 0.08);
    expect(joltOf(singularity, cast, 1500 + 120 + 70, 't1').x).toBeGreaterThan(CELL * 0.15);
    expect(joltOf(singularity, cast, 1500 + 70, 't0').z).toBeLessThan(-CELL * 0.05);
  });
});
