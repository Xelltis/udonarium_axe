import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { SMOKE } from '@axe/domain/effect/scene/fire/fire-parts';
import { castOn, CELL, stagedAt, uprightAt, widestOf } from '@axe/testing/holy-effect-stage';

const TARGET = { x: 400, y: 300 };
const CASTER = { x: 100, y: 500, z: 30 };

function bundled(identifier: string): EffectPreset {
  return createEffectPreset(DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.identifier === identifier)!);
}

function landsAt(preset: EffectPreset): number {
  return effectBlowsOf(preset)[0].atMs / 1000;
}

describe('the shot of holy light as it lands', () => {
  const shot = bundled('EffectPreset_holybolt_3');
  const cast = { ...castOn([TARGET]), casterIdentifier: 'caster', origin: CASTER };
  const lands = landsAt(shot);

  it('lands in the least of the lights that smite, one thin pillar on its target, however high its grade', () => {
    const pillar = uprightAt(stagedAt(shot, cast, lands + 0.03), TARGET);

    expect(shot.gradeLevel).toBe(3);
    expect(pillar.length).toBeGreaterThan(0);
    expect(Math.max(...pillar.map(widestOf))).toBeLessThan(CELL * 1.2);
  });

  it('burns nothing: no fire, no smoke and no soot where it lands', () => {
    for (const since of [0.03, 0.2, 0.5, 1]) {
      const drawn = stagedAt(shot, cast, lands + since);

      expect(drawn.motes.filter((mote) => ['blaze', 'billow', 'smoke', 'plume'].includes(mote.shape))).toEqual([]);
      expect(drawn.floor.filter((mark) => mark.color === SMOKE)).toEqual([]);
    }
  });

  it('draws nothing of its landing before it lands', () => {
    expect(uprightAt(stagedAt(shot, cast, lands * 0.5), TARGET)).toEqual([]);
  });
});

describe('the great sword of light as it lands', () => {
  const blade = bundled('EffectPreset_skyblade');
  const cast = { ...castOn([TARGET]), casterIdentifier: 'caster', origin: CASTER };
  const strikes = landsAt(blade);

  it('brings down the light of its own grade, far wider than the pillar of a shot, and no fire', () => {
    const drawn = stagedAt(blade, cast, strikes + 0.05);
    const pillar = uprightAt(drawn, TARGET);

    expect(pillar.length).toBeGreaterThan(0);
    expect(Math.max(...pillar.map(widestOf))).toBeGreaterThan(CELL * 1.2);
    expect(drawn.motes.filter((mote) => mote.shape === 'blaze' || mote.shape === 'billow')).toEqual([]);
  });
});
