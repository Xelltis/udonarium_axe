import { EffectKind, PROJECTILE_STYLES } from '@axe/domain/effect/effect-kind';
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

  it('shakes lightly for an impact of the lowest grade, which stamps the ground in however light it is', () => {
    expect(effectShakeOf(makePreset('impact', 1))).toBe('soft');
    expect(effectShakeOf(makePreset('impact', 2))).toBe('soft');
    expect(effectShakeOf(makePreset('impact', 3))).toBe('hard');
    for (const kind of ['rubble', 'upheaval', 'bash', 'nova', 'bolt'] as const) {
      expect([kind, effectShakeOf(makePreset(kind, 1))]).toEqual([kind, '']);
    }
  });

  it('shakes for a shot of rock as it breaks, by its grade, and for no other shot that lands in rubble or an impact', () => {
    const shot = (look: string, lands: EffectKind, grade: number, tag = '射撃'): EffectPreset => {
      const preset = makePreset('projectile', grade);
      preset.projectileStyle = look;
      preset.impactKind = lands;
      preset.tagName = tag;
      return preset;
    };

    expect(effectShakeOf(shot('bolt', 'rubble', 2))).toBe('soft');
    expect(effectShakeOf(shot('bolt', 'rubble', 3))).toBe('hard');
    expect(effectShakeOf(shot('bolt', 'rubble', 1))).toBe('');
    expect(effectShakeOf(shot('bullet', 'rubble', 3))).toBe('');
    expect(effectShakeOf(shot('arrow', 'impact', 1))).toBe('');
    expect(effectShakeOf(shot('bolt', 'rubble', 3, '炎'))).toBe('');
  });

  it('shakes for a meteor as it strikes, by its grade, and for no other look of a shot', () => {
    const shot = (look: string, grade: number): EffectPreset => {
      const preset = makePreset('projectile', grade);
      preset.projectileStyle = look;
      return preset;
    };

    expect(effectShakeOf(shot('meteor', 3))).toBe('hard');
    expect(effectShakeOf(shot('meteor', 2))).toBe('soft');
    expect(effectShakeOf(shot('meteor', 1))).toBe('');
    for (const look of PROJECTILE_STYLES.filter((style) => style !== 'meteor')) {
      expect(effectShakeOf(shot(look, 3))).toBe('');
    }
  });

  it('leaves the shaking of a run with a meteor in it to the stage it lands with', () => {
    const run = (stages: EffectStage[]): EffectPreset => {
      const preset = makePreset('projectile', 3);
      preset.projectileStyle = 'meteor';
      preset.stages = JSON.stringify(stages);
      return preset;
    };
    const falls: EffectStage = { role: 'travel', kind: 'projectile', durationMs: 600 };

    expect(effectShakeOf(run([falls, { role: 'impact', kind: 'heal', durationMs: 400 }]))).toBe('');
    expect(effectShakeOf(run([falls, { role: 'impact', kind: 'burst', durationMs: 400 }]))).toBe('hard');
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
