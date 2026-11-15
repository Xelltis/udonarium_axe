import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  gustTimingOf,
  isGust,
  isTornado,
  isWindShot,
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
