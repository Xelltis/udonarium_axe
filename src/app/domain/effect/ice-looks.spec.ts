import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { effectShakeOf } from '@axe/domain/effect/effect-shake';
import {
  blizzardTimingOf,
  blowsAsBlizzard,
  coffinTimingOf,
  freezeTimingOf,
  frostLookOf,
  frostStrikesOf,
  hailStrikesOf,
  isBlizzard,
  isIceShot,
  zeroTimingOf,
} from '@axe/domain/effect/ice-looks';
import { isTornado, windLookOf } from '@axe/domain/effect/wind-looks';

function presetOf(kind: string, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.targeting = 'multi';
  Object.assign(preset, fields);
  return preset;
}

function bundled(name: string): EffectPreset {
  const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.name === name)!;
  return presetOf(seed.kind, {
    grade: seed.grade,
    targeting: seed.targeting,
    areaRadius: seed.areaRadius ?? 0,
    tagName: seed.tagName,
    durationMs: seed.durationMs ?? seed.soundMs,
    impactKind: seed.impactKind ?? '',
    moteStyle: seed.moteStyle ?? '',
  });
}

describe('frostLookOf()', () => {
  it('draws the least frost over no area as hail, the greatest as a pillar or over an area as the cold that stills it, and any other as a crown', () => {
    expect(frostLookOf(presetOf('frost', { grade: 1 }))).toBe('hail');
    expect(frostLookOf(presetOf('frost', { grade: 1, areaRadius: 2 }))).toBe('freeze');
    expect(frostLookOf(presetOf('frost', { grade: 2 }))).toBe('freeze');
    expect(frostLookOf(presetOf('frost', { grade: 2, areaRadius: 3 }))).toBe('freeze');
    expect(frostLookOf(presetOf('frost', { grade: 3 }))).toBe('coffin');
    expect(frostLookOf(presetOf('frost', { grade: 3, areaRadius: 3 }))).toBe('zero');
  });

  it('draws the ice another look lands with as a crown, whatever its grade', () => {
    expect(frostLookOf(presetOf('projectile', { grade: 1, impactKind: 'frost' }))).toBe('freeze');
    expect(frostLookOf(presetOf('skyblade', { grade: 3, impactKind: 'frost' }))).toBe('freeze');
  });

  it('tells the bundled ice apart, each as a look of its own', () => {
    expect(frostLookOf(bundled('氷礫'))).toBe('hail');
    expect(frostLookOf(bundled('氷結'))).toBe('freeze');
    expect(frostLookOf(bundled('絶対零度'))).toBe('zero');
    expect(frostLookOf(bundled('氷棺'))).toBe('coffin');
  });
});

describe('isBlizzard()', () => {
  it('takes a whirlwind of the family of ice, or one that carries frost, for a blizzard', () => {
    expect(isBlizzard(presetOf('vortex', { tagName: '氷' }))).toBe(true);
    expect(isBlizzard(presetOf('vortex', { tagName: '風', moteStyle: 'frost' }))).toBe(true);
    expect(isBlizzard(bundled('吹雪'))).toBe(true);
    expect(blowsAsBlizzard(bundled('吹雪'))).toBe(true);
  });

  it('leaves every other whirlwind the wind it was', () => {
    expect(isBlizzard(presetOf('vortex', { tagName: '風' }))).toBe(false);
    expect(isBlizzard(presetOf('vortex', { tagName: '' }))).toBe(false);
    expect(isBlizzard(presetOf('vortex', { tagName: '氷', moteStyle: 'leaf' }))).toBe(false);
    expect(isBlizzard(presetOf('frost', { tagName: '氷' }))).toBe(false);
    expect(isBlizzard(bundled('突風'))).toBe(false);
    expect(isBlizzard(bundled('竜巻'))).toBe(false);
    expect(windLookOf(bundled('突風'))).toBe('gust');
    expect(isTornado(bundled('竜巻'))).toBe(true);
  });
});

describe('isIceShot()', () => {
  it('takes a bolt that lands in ice for an icicle, unless it is of another element', () => {
    expect(isIceShot(bundled('氷の矢'))).toBe(true);
    expect(isIceShot(presetOf('projectile', { impactKind: 'frost', tagName: '氷' }))).toBe(true);
    expect(isIceShot(presetOf('projectile', { impactKind: 'frost', tagName: '炎' }))).toBe(false);
    expect(isIceShot(presetOf('projectile', { impactKind: 'frost', tagName: '炎', moteStyle: 'frost' }))).toBe(true);
    expect(isIceShot(presetOf('projectile', { impactKind: 'frost', moteStyle: 'spark' }))).toBe(false);
  });

  it('leaves a shot of another look, or one that lands in anything else, as it was', () => {
    expect(isIceShot(presetOf('projectile', { impactKind: 'frost', projectileStyle: 'arrow' }))).toBe(false);
    expect(isIceShot(presetOf('projectile', { impactKind: 'burst', tagName: '氷' }))).toBe(false);
    expect(isIceShot(presetOf('frost', { tagName: '氷' }))).toBe(false);
  });
});

describe('the moments of ice', () => {
  it('drives three great shards of hail one after another, all within the playback', () => {
    for (const duration of [0.4, 1, 2.403, 6]) {
      const strikes = hailStrikesOf(duration);

      expect(strikes).toHaveLength(3);
      expect(strikes[0]).toBeGreaterThan(0);
      expect(strikes[1]).toBeGreaterThan(strikes[0]);
      expect(strikes[2]).toBeGreaterThan(strikes[1]);
      expect(strikes[2]).toBeLessThan(duration * 0.5);
    }
  });

  it('bursts a crown up, stands it, cracks it and breaks it in that order, however short the playback', () => {
    for (const duration of [0.12, 0.52, 3.344, 6]) {
      const timing = freezeTimingOf(duration);

      expect(timing.cracksAt - timing.burstsAt).toBeGreaterThanOrEqual(0.45);
      expect(timing.breaksAt).toBeGreaterThan(timing.cracksAt);
      expect(timing.fallenAt).toBeGreaterThan(timing.breaksAt);
    }
    expect(freezeTimingOf(3.344).burstsAt).toBeCloseTo(0.26, 5);
    expect(freezeTimingOf(0.6, 0).burstsAt).toBe(0);
  });

  it('holds an area frozen for a while before it lets it go', () => {
    for (const duration of [0.5, 4.032, 6]) {
      const timing = zeroTimingOf(duration);

      expect(timing.shattersAt - timing.freezesAt).toBeGreaterThanOrEqual(0.8);
      expect(timing.cracksAt).toBeGreaterThan(timing.freezesAt);
      expect(timing.cracksAt).toBeLessThan(timing.shattersAt);
    }
    expect(zeroTimingOf(4.032).freezesAt).toBeCloseTo(0.5, 5);
  });

  it('cracks a pillar three times between its sealing and its shattering', () => {
    for (const duration of [0.5, 4.032, 6]) {
      const timing = coffinTimingOf(duration);

      expect(timing.cracksAt).toHaveLength(3);
      expect(timing.cracksAt[0]).toBeGreaterThan(timing.sealsAt);
      expect(timing.cracksAt[2]).toBeLessThan(timing.shattersAt);
      expect(timing.shattersAt - timing.sealsAt).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('winds a blizzard up, blows it and lets it fail, in halves of a playback too short for both', () => {
    const whole = blizzardTimingOf(3.318);

    expect(whole.blowsAt).toBeCloseTo(0.45, 5);
    expect(whole.failsAt).toBeCloseTo(2.918, 5);
    expect(whole.goneAt).toBeCloseTo(3.618, 5);
    expect(blizzardTimingOf(0.6).blowsAt).toBeCloseTo(0.3, 5);
    expect(blizzardTimingOf(0.6).failsAt).toBeCloseTo(0.3, 5);
  });
});

describe('the blows ice lands', () => {
  it('lands hail three times, a crown once, and the cold over an area and a pillar as they close and as they shatter', () => {
    expect(effectBlowsOf(bundled('氷礫'))).toHaveLength(3);
    expect(effectBlowsOf(bundled('氷結'))).toHaveLength(1);
    expect(effectBlowsOf(bundled('絶対零度')).map((blow) => blow.atMs)).toEqual(
      frostStrikesOf(bundled('絶対零度'), 4.032).map((at) => Math.round(at * 1000))
    );
    expect(effectBlowsOf(bundled('絶対零度'))).toHaveLength(2);
    expect(effectBlowsOf(bundled('氷棺'))).toHaveLength(2);
  });

  it('holds still at both blows of the greatest ice, and only at the first great shard of hail', () => {
    expect(effectBlowsOf(bundled('絶対零度')).map((blow) => blow.holdMs)).toEqual([140, 140]);
    expect(effectBlowsOf(bundled('氷棺')).map((blow) => blow.holdMs)).toEqual([140, 140]);
    expect(effectBlowsOf(bundled('氷礫')).map((blow) => blow.holdMs > 0)).toEqual([true, true, false]);
  });

  it('shakes hard at the greatest ice, lightly at a crown and not at hail', () => {
    expect(effectShakeOf(bundled('絶対零度'))).toBe('hard');
    expect(effectShakeOf(bundled('氷棺'))).toBe('hard');
    expect(effectShakeOf(bundled('氷結'))).toBe('soft');
    expect(effectShakeOf(bundled('氷礫'))).toBe('');
  });

  it('lands no blow with a blizzard, and shakes nothing', () => {
    expect(effectBlowsOf(bundled('吹雪'))).toEqual([]);
    expect(effectShakeOf(bundled('吹雪'))).toBe('');
  });
});

describe('how a blizzard moves the pieces', () => {
  const cast: EffectCast = {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { x: 0, y: 0, z: 30 },
    targets: [{ identifier: 'target', x: 300, y: 0, z: 0 }],
    seed: 5,
  };

  it('shoves the piece it blows about round and never takes it up off the floor, as a tornado does', () => {
    const blizzard = bundled('吹雪');
    const tornado = presetOf('vortex', { grade: 2, tagName: '風', durationMs: 3318 });
    const blown = [600, 1200, 1800].map((ms) => effectJoltsOf(blizzard, cast, ms, 50).get('target')!);

    for (const jolt of blown) {
      expect(jolt.z).toBe(0);
      expect(Math.hypot(jolt.x, jolt.y)).toBeGreaterThan(0.5);
      expect(Math.hypot(jolt.x, jolt.y)).toBeLessThan(4);
    }
    expect(effectJoltsOf(tornado, cast, 1200, 50).get('target')!.z).toBeGreaterThan(0);
  });

  it('lets the piece stand still again once it has blown itself out', () => {
    const blizzard = bundled('吹雪');
    const gone = blizzardTimingOf(3.318).goneAt * 1000;

    expect(effectJoltsOf(blizzard, cast, gone + 1, 50).size).toBe(0);
  });
});
