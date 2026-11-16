import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';

const CELL = 50;

function presetOf(
  kind: 'bolt' | 'frost' | 'beam' | 'raybeam' | 'gravity',
  primary: string,
  secondary: string
): EffectPreset {
  const preset = new EffectPreset(`floor-${kind}`);
  preset.kind = kind;
  preset.grade = 2;
  preset.durationMs = 2000;
  preset.colorPrimary = primary;
  preset.colorSecondary = secondary;
  return preset;
}

function staged(preset: EffectPreset, ms: number): Staged {
  const drawn = nothingStaged();
  const cast = {
    presetIdentifier: preset.identifier,
    casterIdentifier: 'caster',
    origin: { x: 100, y: 500, z: 30 },
    targets: [{ identifier: 'target', x: 500, y: 300, z: 0 }],
    seed: 7,
  };
  stageEffect(preset, cast, ms, { cellPx: CELL }, drawn);
  return drawn;
}

describe('what lightning, a beam and ice leave on the floor', () => {
  it('leaves no ragged plate of its own colour under a bolt of lightning, at any moment', () => {
    const bolt = presetOf('bolt', '#e8dcff', '#a070ff');

    for (let ms = 0; ms <= 3000; ms += 100) {
      expect(staged(bolt, ms).floor.filter((mark) => mark.shape === 'scorch')).toEqual([]);
    }
    expect(staged(bolt, 1500).floor.some((mark) => mark.shape === 'disc' && mark.blend === 'color')).toBe(true);
  });

  it.each(['beam', 'raybeam'] as const)('leaves soot under a %s that stays once it has stopped', (kind) => {
    const beam = presetOf(kind, '#d8f4ff', '#40b0ff');
    const soot = (ms: number) =>
      staged(beam, ms).floor.filter((mark) => mark.shape === 'disc' && mark.blend === 'color');

    for (let ms = 0; ms <= 2600; ms += 100) {
      expect(staged(beam, ms).floor.filter((mark) => mark.shape === 'scorch')).toEqual([]);
    }
    expect(soot(1200).length).toBeGreaterThan(0);
    expect(soot(2100).length).toBeGreaterThan(0);
  });

  it('spreads rime under ice as a soft disc rather than a ragged plate', () => {
    const frost = presetOf('frost', '#eaf8ff', '#7fd4ff');

    for (let ms = 300; ms <= 2600; ms += 100) {
      expect(staged(frost, ms).floor.filter((mark) => mark.shape === 'scorch')).toEqual([]);
    }
    expect(staged(frost, 1000).floor.some((mark) => mark.shape === 'disc' && mark.blend === 'color')).toBe(true);
  });

  it('keeps what they leave on the floor long enough after the playback for it to be seen', () => {
    const lingers = (kind: Parameters<typeof presetOf>[0]) => sceneLingerMsOf(presetOf(kind, '#e8dcff', '#a070ff'));

    expect(lingers('bolt')).toBe(1500);
    expect(lingers('frost')).toBe(1200);
    expect(lingers('beam')).toBe(2200);
    expect(lingers('raybeam')).toBe(1200);
    expect(lingers('gravity')).toBe(1500);
    expect(staged(presetOf('bolt', '#e8dcff', '#a070ff'), 3000).floor.length).toBeGreaterThan(0);
    expect(staged(presetOf('beam', '#d8f4ff', '#40b0ff'), 2700).floor.length).toBeGreaterThan(0);
  });

  it('lets the grit a singularity lets go fall and lie before it is gone', () => {
    const gravity = presetOf('gravity', '#c9a8ff', '#5a2ea6');

    expect(staged(gravity, 3000).motes.some((mote) => mote.shape === 'chunk')).toBe(true);
  });
});
