import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  blowsAsStorm,
  cutsAsWind,
  fliesAsVacuum,
  gustTimingOf,
  isGust,
  isStormWind,
  isTornado,
  isWindShot,
  stormSoundsAt,
  stormStrikesOf,
  tornadoTimingOf,
  windLookOf,
} from '@axe/domain/effect/wind-looks';

function vortexOf(grade: number, areaRadius = 0, targeting = 'multi'): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'vortex';
  preset.grade = grade;
  preset.targeting = targeting;
  preset.areaRadius = areaRadius;
  return preset;
}

function shotOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.impactKind = 'vortex';
  preset.tagName = '射撃';
  Object.assign(preset, fields);
  return preset;
}

describe('windLookOf()', () => {
  it('draws a vortex of the lowest grade over no area as a gust, and every other as a tornado', () => {
    expect(windLookOf(vortexOf(1))).toBe('gust');
    expect(windLookOf(vortexOf(1, 0, 'single'))).toBe('gust');
    expect(windLookOf(vortexOf(1, 2))).toBe('tornado');
    expect(windLookOf(vortexOf(2))).toBe('tornado');
    expect(windLookOf(vortexOf(3, 3))).toBe('tornado');
  });

  it('draws the whirlwind another look lands with as a tornado, whatever its grade', () => {
    const shot = shotOf({ grade: 1 });

    expect(windLookOf(shot)).toBe('tornado');
    expect(isGust(shot)).toBe(false);
    expect(isTornado(shot)).toBe(false);
  });

  it('draws the bundled gust as a gust and the bundled tornado as a tornado', () => {
    const bundled = (name: string) => {
      const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.name === name)!;
      return vortexOf(seed.grade, seed.areaRadius ?? 0, seed.targeting);
    };

    expect(isGust(bundled('突風'))).toBe(true);
    expect(isTornado(bundled('竜巻'))).toBe(true);
  });
});

describe('isWindShot()', () => {
  it('takes a bolt that lands in a whirlwind for a shot of wind, as the bundled one is written', () => {
    const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.name === '風弾')!;

    expect(isWindShot(shotOf({ tagName: seed.tagName, impactKind: seed.impactKind! }))).toBe(true);
    expect(isWindShot(shotOf({ tagName: '風' }))).toBe(true);
    expect(isWindShot(shotOf({ tagName: 'my own' }))).toBe(true);
  });

  it('leaves a shot of another look or another landing as it is', () => {
    expect(isWindShot(shotOf({ projectileStyle: 'arrow' }))).toBe(false);
    expect(isWindShot(shotOf({ impactKind: 'burst' }))).toBe(false);
    expect(isWindShot(vortexOf(2))).toBe(false);
  });

  it('leaves a bolt of a family with an element of its own as it is, though it lands in a whirlwind', () => {
    for (const tagName of ['炎', '氷', '雷', '闇', '聖', '状態異常', '土', '回復', '強化']) {
      expect(isWindShot(shotOf({ tagName }))).toBe(false);
    }
  });

  it('goes by the particle a bolt is told to carry before its family', () => {
    expect(isWindShot(shotOf({ tagName: '炎', moteStyle: 'leaf' }))).toBe(true);
    expect(isWindShot(shotOf({ tagName: '射撃', moteStyle: 'spark' }))).toBe(false);
    expect(isWindShot(shotOf({ tagName: '風', moteStyle: 'none' }))).toBe(false);
    expect(isWindShot(shotOf({ tagName: '射撃', moteStyle: 'not a particle' }))).toBe(true);
  });
});

describe('gustTimingOf() and tornadoTimingOf()', () => {
  it('gathers a gust for a tenth of a second and strikes a quarter of a second after it is thrown', () => {
    const timing = gustTimingOf(1.071);

    expect(timing.thrownAt).toBeCloseTo(0.1);
    expect(timing.strikesAt).toBeCloseTo(0.35);
  });

  it('strikes within the first half of a gust too short for that', () => {
    const timing = gustTimingOf(0.4);

    expect(timing.strikesAt).toBeLessThan(0.2);
    expect(timing.thrownAt).toBeLessThan(timing.strikesAt);
    expect(timing.thrownAt).toBeGreaterThan(0);
  });

  it('raises a tornado in half a second and thins it away in six tenths, done a little after its playback', () => {
    const timing = tornadoTimingOf(3.318);

    expect(timing.risenAt).toBeCloseTo(0.5);
    expect(timing.goneAt - timing.thinsAt).toBeCloseTo(0.6);
    expect(timing.thinsAt).toBeLessThan(3.318);
    expect(timing.goneAt).toBeLessThan(3.318 + 0.8);
  });

  it('gives a tornado too short to do both half its playback to rise in and thins it from then', () => {
    const timing = tornadoTimingOf(0.5);

    expect(timing.risenAt).toBeCloseTo(0.25);
    expect(timing.thinsAt).toBeGreaterThanOrEqual(timing.risenAt);
  });
});

describe('the keyed looks of wind', () => {
  function presetOf(fields: Partial<EffectPreset>): EffectPreset {
    const preset = new EffectPreset('preset');
    Object.assign(preset, fields);
    return preset;
  }

  it('makes a whirlwind told to carry lightning a storm, whatever its grade, and neither a gust nor a tornado', () => {
    for (const grade of [1, 2, 3]) {
      const storm = presetOf({ kind: 'vortex', grade, moteStyle: 'arc', tagName: '風' });
      expect([grade, isStormWind(storm), blowsAsStorm(storm), isGust(storm), isTornado(storm)]).toEqual([
        grade,
        true,
        true,
        false,
        false,
      ]);
    }
    expect(isStormWind(presetOf({ kind: 'vortex', grade: 3, tagName: '雷' }))).toBe(false);
    expect(isStormWind(presetOf({ kind: 'bolt', moteStyle: 'arc' }))).toBe(false);
  });

  it('strikes a storm three times once its cloud has gathered, and sounds its thunder cracking at the first', () => {
    const strikes = stormStrikesOf(3.318);
    const storm = presetOf({ kind: 'vortex', moteStyle: 'arc' });

    expect(strikes).toHaveLength(3);
    expect(strikes[0]).toBeGreaterThan(tornadoTimingOf(3.318).risenAt);
    expect(strikes.at(-1)!).toBeLessThan(tornadoTimingOf(3.318).thinsAt);
    expect(stormSoundsAt(storm, 3.318)! * 3.318).toBeLessThan(strikes[0]);
    expect(stormSoundsAt(presetOf({ kind: 'vortex' }), 3.318)).toBeUndefined();
  });

  it('cuts in sickles of wind in the family of wind, or where a cut names leaves, and in no other', () => {
    expect(cutsAsWind(presetOf({ kind: 'slash', tagName: '風' }))).toBe(true);
    expect(cutsAsWind(presetOf({ kind: 'slash', tagName: '物理', moteStyle: 'leaf' }))).toBe(true);
    expect(cutsAsWind(presetOf({ kind: 'slash', tagName: '風', moteStyle: 'spark' }))).toBe(false);
    expect(cutsAsWind(presetOf({ kind: 'slash', tagName: '物理' }))).toBe(false);
    expect(cutsAsWind(presetOf({ kind: 'vortex', tagName: '風' }))).toBe(false);
  });

  it('flies a crescent that lands in a whirlwind as a wave of the void, and one that lands in a cut as it always flew', () => {
    expect(fliesAsVacuum(presetOf({ kind: 'projectile', projectileStyle: 'crescent', impactKind: 'vortex' }))).toBe(
      true
    );
    expect(fliesAsVacuum(presetOf({ kind: 'projectile', projectileStyle: 'crescent', impactKind: 'slash' }))).toBe(
      false
    );
    expect(fliesAsVacuum(presetOf({ kind: 'projectile', impactKind: 'vortex' }))).toBe(false);
  });

  it('keys every bundled wind attack to the look it is drawn as', () => {
    const seeded = (name: string) => {
      const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.name === name)!;
      return presetOf({
        kind: seed.kind,
        grade: seed.grade,
        tagName: seed.tagName,
        moteStyle: seed.moteStyle ?? '',
        impactKind: seed.impactKind ?? '',
        projectileStyle: seed.projectileStyle ?? 'bolt',
        areaRadius: seed.areaRadius ?? 0,
      });
    };

    expect(cutsAsWind(seeded('鎌鼬'))).toBe(true);
    expect(fliesAsVacuum(seeded('真空波'))).toBe(true);
    expect(blowsAsStorm(seeded('大嵐'))).toBe(true);
    expect(isTornado(seeded('竜巻'))).toBe(true);
    expect(isGust(seeded('突風'))).toBe(true);
  });
});
