import { beamLookOf, beamTimingOf, isBeamLook, laserTimingOf } from '@axe/domain/effect/beam-looks';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { effectMoteOf } from '@axe/domain/effect/effect-motes';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectShakeOf } from '@axe/domain/effect/effect-shake';

function presetOf(kind: 'beam' | 'raybeam', durationMs: number, grade = 3): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = durationMs;
  preset.tagName = '射撃';
  return preset;
}

describe('the looks of a beam', () => {
  it('draws a great beam as the braid of many hues only where its particles name it', () => {
    expect(beamLookOf({ moteStyle: 'prism' })).toBe('prism');
    expect(beamLookOf({ moteStyle: '' })).toBe('great');
    expect(beamLookOf({ moteStyle: 'spark' })).toBe('great');
    expect(isBeamLook('prism')).toBe(true);
  });

  it('leaves the particles of a beam of many hues to its family, as a tool that has never heard of it does', () => {
    const preset = presetOf('beam', 3000);
    preset.moteStyle = 'prism';

    expect(effectMoteOf(preset)).toBe('spark');
  });

  it('fires a great beam as its blow lands, a lance just before, and pours until just short of its end', () => {
    const preset = presetOf('beam', 3344);
    const fires = effectBlowsOf(preset)[0].atMs / 1000;
    const timing = beamTimingOf(3.344, fires);

    expect(fires).toBeCloseTo(0.936, 2);
    expect(timing.lanceAt).toBeLessThan(fires);
    expect(fires - timing.lanceAt).toBeLessThan(0.1);
    expect(timing.failsAt).toBeGreaterThan(3.2);
    expect(timing.goneAt).toBeGreaterThan(timing.failsAt + 0.3);
  });

  it('still fires a great beam given no time at all', () => {
    const timing = beamTimingOf(0.4, 0.112);

    expect(timing.failsAt).toBeGreaterThanOrEqual(timing.firesAt + 0.3);
    expect(timing.lanceAt).toBeGreaterThanOrEqual(0);
  });

  it('lights a laser at once, holds its target as its blow lands and lets go before its end', () => {
    const preset = presetOf('raybeam', 2038, 2);
    const holds = effectBlowsOf(preset)[0].atMs / 1000;
    const timing = laserTimingOf(2.038, holds);

    expect(holds).toBeCloseTo(1.019, 2);
    expect(timing.lightsAt).toBeLessThan(0.2);
    expect(timing.breaksAt).toBeGreaterThan(holds + 0.5);
    expect(timing.cutAt).toBeLessThan(2.038);
  });

  it('shakes the screen as a laser takes hold, by its grade', () => {
    expect([1, 2, 3].map((grade) => effectShakeOf(presetOf('raybeam', 2000, grade)))).toEqual(['', 'soft', 'hard']);
  });
});
