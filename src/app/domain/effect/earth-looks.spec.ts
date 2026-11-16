import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import {
  heavesGround,
  isRockShot,
  quakeLookOf,
  quakeSoundsAt,
  quakeStrikesOf,
  RUBBLE_HEAVES,
  rubbleHeavesOf,
  upheavalTimingOf,
} from '@axe/domain/effect/earth-looks';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

function shotOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.impactKind = 'rubble';
  preset.tagName = '射撃';
  Object.assign(preset, fields);
  return preset;
}

describe('isRockShot()', () => {
  it('takes a bolt that lands in rubble for a shot of rock, as the bundled one is written', () => {
    const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.name === '岩弾')!;

    expect(isRockShot(shotOf({ tagName: seed.tagName, impactKind: seed.impactKind! }))).toBe(true);
    expect(isRockShot(shotOf({ tagName: '土' }))).toBe(true);
    expect(isRockShot(shotOf({ tagName: 'my own family' }))).toBe(true);
  });

  it('takes no other look of shot for one, nor a bolt that lands in anything else', () => {
    expect(isRockShot(shotOf({ projectileStyle: 'bullet' }))).toBe(false);
    expect(isRockShot(shotOf({ projectileStyle: 'missile' }))).toBe(false);
    expect(isRockShot(shotOf({ impactKind: 'impact' }))).toBe(false);
    expect(isRockShot(shotOf({ impactKind: 'burst' }))).toBe(false);
  });

  it('leaves a bolt of another element as it was, told by its family or by the particle it carries', () => {
    expect(isRockShot(shotOf({ tagName: '炎' }))).toBe(false);
    expect(isRockShot(shotOf({ tagName: '聖' }))).toBe(false);
    expect(isRockShot(shotOf({ tagName: '風' }))).toBe(false);
    expect(isRockShot(shotOf({ moteStyle: 'frost' }))).toBe(false);
    expect(isRockShot(shotOf({ moteStyle: 'leaf' }))).toBe(false);
    expect(isRockShot(shotOf({ tagName: '炎', moteStyle: 'spark' }))).toBe(true);
    expect(isRockShot(shotOf({ tagName: '炎', moteStyle: 'none' }))).toBe(true);
  });

  it('takes none of the bundled shots but the one for a shot of rock', () => {
    const rocky = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => {
      if (seed.kind !== 'projectile' || seed.stages) return false;
      const preset = shotOf({ tagName: seed.tagName, impactKind: seed.impactKind ?? 'burst' });
      if (seed.projectileStyle) preset.projectileStyle = seed.projectileStyle;
      if (seed.moteStyle) preset.moteStyle = seed.moteStyle;
      return isRockShot(preset);
    });

    expect(rocky.map((seed) => seed.name)).toEqual(['岩弾']);
  });
});

describe('rubbleHeavesOf()', () => {
  it('heaves three times, a beat apart, from a little way into a long playback', () => {
    const heaves = rubbleHeavesOf(5.616);

    expect(heaves).toHaveLength(RUBBLE_HEAVES);
    expect(heaves[0]).toBeCloseTo(0.449, 2);
    expect(heaves[1] - heaves[0]).toBeCloseTo(0.3, 5);
    expect(heaves[2] - heaves[1]).toBeCloseTo(0.3, 5);
  });

  it('brings the heaves closer in a short playback, all of them within it', () => {
    const heaves = rubbleHeavesOf(0.8);

    expect(heaves[1] - heaves[0]).toBeLessThan(0.3);
    expect(heaves[2]).toBeLessThan(0.8);
    expect(heaves[1]).toBeGreaterThan(heaves[0]);
  });

  it('counts from the first heave it is given', () => {
    expect(rubbleHeavesOf(5.616, 1)[0]).toBe(1);
    expect(rubbleHeavesOf(5.616, 1)[2]).toBeCloseTo(1.6, 5);
  });
});

describe('upheavalTimingOf()', () => {
  it('runs for a third of a second before it bursts, stands, cracks, breaks and sinks in that order', () => {
    const timing = upheavalTimingOf(5.042, 0.605);

    expect(timing.runsAt).toBeCloseTo(0.255, 3);
    expect(timing.cracksAt).toBeCloseTo(5.042 * 0.65, 3);
    expect(timing.breaksAt).toBeGreaterThan(timing.cracksAt);
    expect(timing.sunkAt).toBeGreaterThan(timing.breaksAt);
    expect(timing.sunkAt).toBeLessThan(5.042);
  });

  it('stands its pillars a while however short the playback, and runs for less where it bursts at once', () => {
    const landing = upheavalTimingOf(0.96, 0);

    expect(landing.runsAt).toBe(0);
    expect(landing.cracksAt).toBeCloseTo(0.8, 5);
    expect(upheavalTimingOf(1.5, 0.18).runsAt).toBeCloseTo(0.072, 5);
  });
});

describe('heavesGround()', () => {
  it('is so of rubble and an upheaval on their own, and of nothing else', () => {
    expect(heavesGround({ isStaged: false, effectKind: 'rubble' })).toBe(true);
    expect(heavesGround({ isStaged: false, effectKind: 'upheaval' })).toBe(true);
    expect(heavesGround({ isStaged: false, effectKind: 'impact' })).toBe(false);
    expect(heavesGround({ isStaged: false, effectKind: 'projectile' })).toBe(false);
    expect(heavesGround({ isStaged: true, effectKind: 'upheaval' })).toBe(false);
  });
});

describe('a quake', () => {
  function quakeOf(grade: number, areaRadius = 0): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = 'quake';
    preset.grade = grade;
    preset.targeting = 'multi';
    preset.areaRadius = areaRadius;
    return preset;
  }

  it('tears a rift below the highest grade, and heaves the ground of an area at the highest over one', () => {
    expect(quakeLookOf(quakeOf(1))).toBe('rift');
    expect(quakeLookOf(quakeOf(2))).toBe('rift');
    expect(quakeLookOf(quakeOf(2, 3))).toBe('rift');
    expect(quakeLookOf(quakeOf(3))).toBe('rift');
    expect(quakeLookOf(quakeOf(3, 3))).toBe('quake');
  });

  it('strikes once as a rift reaches its target, and three times over an area, the heaves well apart', () => {
    expect(quakeStrikesOf(quakeOf(2), 2.691)).toEqual([0.3]);
    const heaves = quakeStrikesOf(quakeOf(3, 3), 5.042)!;
    expect(heaves).toEqual([0.42, 1.88, 2.68]);
    expect(quakeStrikesOf(quakeOf(3, 3), 1.5)!.every((heave) => heave < 1.5)).toBe(true);
    const shot = new EffectPreset('shot');
    shot.kind = 'projectile';
    expect(quakeStrikesOf(shot, 1)).toBeUndefined();
  });

  it('sounds its landing a little before it first strikes, as the crack of rock peaks after it starts', () => {
    expect(quakeSoundsAt(quakeOf(2), 2.691)! * 2.691).toBeCloseTo(0.2);
    expect(quakeSoundsAt(quakeOf(3, 3), 5.042)! * 5.042).toBeCloseTo(0.32);
  });

  it('heaves what it strikes up off the floor, as rubble does, but not as a stage of a run', () => {
    expect(heavesGround(quakeOf(2))).toBe(true);
  });
});
