import { beamTimingOf, laserTimingOf } from '@axe/domain/effect/beam-looks';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';

const CELL = 50;

function presetOf(kind: 'beam' | 'raybeam' | 'arc', durationMs: number): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = 3;
  preset.durationMs = durationMs;
  preset.staggerMs = 0;
  return preset;
}

const cast: EffectCast = {
  presetIdentifier: 'preset',
  casterIdentifier: 'caster',
  origin: { x: 100, y: 300, z: 30 },
  targets: [{ identifier: 'target', x: 500, y: 300, z: 0 }],
  seed: 7,
};

describe('how the pieces bear a great beam', () => {
  const preset = presetOf('beam', 3344);
  const fires = effectBlowsOf(preset)[0].atMs;
  const timing = beamTimingOf(3.344, fires / 1000);
  const at = (ms: number, who: string) => effectJoltsOf(preset, cast, ms, CELL).get(who);

  it('leans the one who fires back from the target as the beam gathers, and never towards it', () => {
    expect(at(300, 'caster')!.x).toBeLessThan(0);
    expect(at(800, 'caster')!.x).toBeLessThan(at(300, 'caster')!.x);
    expect(at(800, 'caster')!.y).toBeCloseTo(0);
  });

  it('throws the one who fires back as it is let go, then holds it braced until the beam fails', () => {
    const kicked = at(fires + 20, 'caster')!.x;
    const braced = at(fires + 1200, 'caster')!.x;

    expect(kicked).toBeLessThan(at(fires - 20, 'caster')!.x);
    expect(braced).toBeLessThan(0);
    expect(braced).toBeGreaterThan(kicked);
    expect(at(timing.failsAt * 1000 + 600, 'caster')).toBeUndefined();
  });

  it('presses the piece it pours over back along its line for as long as it pours, shaking', () => {
    const pressed = (ms: number) => at(fires + ms, 'target')!;

    expect(pressed(1000).x).toBeGreaterThan(CELL * 0.06);
    expect(pressed(2000).x).toBeGreaterThan(CELL * 0.06);
    expect(pressed(1000).y).not.toBe(pressed(1040).y);
    expect(at(fires - 100, 'target')).toBeUndefined();
    expect(at(timing.failsAt * 1000 + 600, 'target')).toBeUndefined();
  });
});

describe('how a piece bears a laser', () => {
  const preset = presetOf('raybeam', 2038);
  const holds = effectBlowsOf(preset)[0].atMs;
  const timing = laserTimingOf(2.038, holds / 1000);
  const at = (ms: number) => effectJoltsOf(preset, cast, ms, CELL).get('target');

  it('stands still while the laser cuts its way to it, and shakes for as long as it burns on it', () => {
    expect(at(holds - 200)).toBeUndefined();
    expect(at(holds + 500)).toBeDefined();
    expect(at(holds + 500)).not.toEqual(at(holds + 540));
    expect(at(timing.cutAt * 1000 + 500)).toBeUndefined();
  });

  it('adds nothing to an effect that is no beam', () => {
    const current = presetOf('arc', 1400);

    expect(effectJoltsOf(current, cast, 1390, CELL).get('caster')).toBeUndefined();
  });
});
