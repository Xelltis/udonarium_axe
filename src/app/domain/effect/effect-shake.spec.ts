import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectShakeOf } from '@axe/domain/effect/effect-shake';
import { type EffectStage } from '@axe/domain/effect/effect-stage';

describe('effectShakeOf()', () => {
  function makePreset(kind: EffectKind, grade: number): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = kind;
    preset.grade = grade;
    preset.colorPrimary = '#dff2ff';
    return preset;
  }

  it('shakes only for an effect that lands a blow', () => {
    expect(effectShakeOf(makePreset('burst', 3))).toBe('hard');
    expect(effectShakeOf(makePreset('upheaval', 3))).toBe('hard');
    // Shaking for healing and shields too would give everything the same weight.
    expect(effectShakeOf(makePreset('heal', 3))).toBe('');
    expect(effectShakeOf(makePreset('barrier', 3))).toBe('');
  });

  it('shakes harder at the higher grades and not at all at the lowest', () => {
    expect(effectShakeOf(makePreset('burst', 1))).toBe('');
    expect(effectShakeOf(makePreset('burst', 2))).toBe('soft');
    expect(effectShakeOf(makePreset('burst', 3))).toBe('hard');
  });

  it('looks at what a run draws rather than the look left on the effect', () => {
    // A run draws its stages; the look on the effect marks its tile and nothing else.
    const staged = (stages: EffectStage[], kind: EffectKind): EffectPreset => {
      const preset = makePreset(kind, 3);
      preset.stages = JSON.stringify(stages);
      return preset;
    };

    expect(effectShakeOf(staged([{ role: 'impact', kind: 'burst', durationMs: 400 }], 'heal'))).toBe('hard');
    expect(effectShakeOf(staged([{ role: 'field', kind: 'aura', durationMs: 400 }], 'burst'))).toBe('');
  });
});
