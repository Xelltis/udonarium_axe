import { EffectCast } from '@axe/domain/effect/effect-cast';
import { effectParticlePlacements } from '@axe/domain/effect/effect-particle-placements';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

function presetOf(kind: string): EffectPreset {
  const preset = new EffectPreset();
  preset.kind = kind;
  preset.durationMs = 1000;
  preset.staggerMs = 0;
  return preset;
}

function castOn(...points: { identifier: string; x: number; y: number }[]): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: '',
    origin: null,
    targets: points.map((point) => ({ ...point, z: 0 })),
    seed: 3,
  };
}

describe('effectParticlePlacements', () => {
  const options = { baseSize: 50 };

  it('glows once at each target whose playback is under way, keyed by its place in the cast', () => {
    const placed = effectParticlePlacements(
      presetOf('heal'),
      castOn({ identifier: 'a', x: 100, y: 200 }, { identifier: 'b', x: 300, y: 50 }),
      400,
      options,
      8
    );

    expect(placed.map((placement) => placement.key)).toEqual(['0', '1']);
    expect(placed[1].center).toEqual({ identifier: 'b', x: 300, y: 50, z: 0 });
    expect(placed.every((placement) => placement.layer.particles.length > 0)).toBe(true);
  });

  it('leaves out hidden targets, and stops at the limit', () => {
    const cast = castOn(
      { identifier: 'a', x: 0, y: 0 },
      { identifier: 'b', x: 0, y: 0 },
      { identifier: 'c', x: 0, y: 0 }
    );
    const preset = presetOf('heal');

    expect(
      effectParticlePlacements(preset, cast, 400, { ...options, hiddenIdentifiers: new Set(['a']) }, 8).map(
        (placement) => placement.key
      )
    ).toEqual(['1', '2']);
    expect(effectParticlePlacements(preset, cast, 400, options, 2)).toHaveLength(2);
  });

  it('glows nowhere before or after the playback', () => {
    const preset = presetOf('heal');
    const cast = castOn({ identifier: 'a', x: 0, y: 0 });

    expect(effectParticlePlacements(preset, cast, -10, options, 8)).toEqual([]);
    expect(effectParticlePlacements(preset, cast, 1100, options, 8)).toEqual([]);
  });
});
