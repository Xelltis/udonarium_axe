import { applyEffectPresetSeed, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
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

  it('shakes lightly for an impact of the lowest grade, which stamps the ground in however light it is', () => {
    expect(effectShakeOf(makePreset('impact', 1))).toBe('soft');
    expect(effectShakeOf(makePreset('impact', 2))).toBe('soft');
    expect(effectShakeOf(makePreset('impact', 3))).toBe('hard');
    for (const kind of ['rubble', 'upheaval', 'bash', 'nova', 'bolt'] as const) {
      expect([kind, effectShakeOf(makePreset(kind, 1))]).toEqual([kind, '']);
    }
  });

  it('shakes for a cut, for ice bursting up and for a piece cut in two, by grade', () => {
    for (const kind of ['slash', 'frost', 'bisect'] as const) {
      expect([kind, [1, 2, 3].map((grade) => effectShakeOf(makePreset(kind, grade)))]).toEqual([
        kind,
        ['', 'soft', 'hard'],
      ]);
    }
  });

  it('shakes for a draining and for the looks of darkness, and lightly for spikes of shadow of the lowest grade', () => {
    expect(effectShakeOf(makePreset('drain', 2))).toBe('soft');
    expect(effectShakeOf(makePreset('shadow', 1))).toBe('soft');
    expect(effectShakeOf(makePreset('shadow', 3))).toBe('hard');
    expect(effectShakeOf(makePreset('darkorb', 2))).toBe('soft');
    expect(effectShakeOf(makePreset('darkorb', 3))).toBe('hard');
  });

  it('shakes lightly for the greatest aura on its own, and for no other aura, healing or shield', () => {
    expect(effectShakeOf(makePreset('aura', 3))).toBe('soft');
    expect(effectShakeOf(makePreset('aura', 2))).toBe('');
    expect(effectShakeOf(makePreset('aura', 1))).toBe('');
    for (const kind of ['heal', 'barrier', 'warp', 'arc'] as const) {
      expect([kind, effectShakeOf(makePreset(kind, 3))]).toEqual([kind, '']);
    }
  });

  it('shakes for a shot of rock as it breaks, by its grade, and for no arrow or bolt of fire that lands in rubble or an impact', () => {
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
    expect(effectShakeOf(shot('arrow', 'rubble', 2))).toBe('');
    expect(effectShakeOf(shot('arrow', 'impact', 1))).toBe('');
    expect(effectShakeOf(shot('bolt', 'rubble', 3, '炎'))).toBe('');
  });

  it('shakes for a meteor as it strikes, by its grade, and for no shot of light or blade', () => {
    const shot = (look: string, grade: number): EffectPreset => {
      const preset = makePreset('projectile', grade);
      preset.projectileStyle = look;
      return preset;
    };

    expect(effectShakeOf(shot('meteor', 3))).toBe('hard');
    expect(effectShakeOf(shot('meteor', 2))).toBe('soft');
    expect(effectShakeOf(shot('meteor', 1))).toBe('');
    for (const look of ['bolt', 'blaster'] as const) {
      expect([look, effectShakeOf(shot(look, 3))]).toEqual([look, '']);
    }
  });

  it('shakes lightly for a cut thrown off a blade of the middle grade and over, and no harder', () => {
    const cut = (grade: number): EffectPreset => {
      const preset = makePreset('projectile', grade);
      preset.projectileStyle = 'crescent';
      return preset;
    };

    expect(effectShakeOf(cut(1))).toBe('');
    expect(effectShakeOf(cut(2))).toBe('soft');
    expect(effectShakeOf(cut(3))).toBe('soft');
  });

  it('shakes for a great sword out of the sky on its own, by its grade', () => {
    expect(effectShakeOf(makePreset('skyblade', 1))).toBe('');
    expect(effectShakeOf(makePreset('skyblade', 2))).toBe('soft');
    expect(effectShakeOf(makePreset('skyblade', 3))).toBe('hard');
  });

  it('leaves the shaking of a run with a great sword or a thrown cut in it to the stage it lands with', () => {
    const run = (kind: EffectKind, stages: EffectStage[]): EffectPreset => {
      const preset = makePreset(kind, 3);
      preset.projectileStyle = 'crescent';
      preset.stages = JSON.stringify(stages);
      return preset;
    };
    const heals: EffectStage = { role: 'impact', kind: 'heal', durationMs: 400 };
    const bursts: EffectStage = { role: 'impact', kind: 'burst', durationMs: 400 };

    for (const kind of ['skyblade', 'projectile'] as const) {
      const travels: EffectStage = { role: 'travel', kind, durationMs: 600 };
      expect(effectShakeOf(run(kind, [travels, heals]))).toBe('');
      expect(effectShakeOf(run(kind, [travels, bursts]))).toBe('hard');
    }
  });

  it('shakes for each bundled cut and great sword as its weight asks', () => {
    const shakes = (identifier: string): string => {
      const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.identifier === identifier);
      if (!seed) throw new Error(`no seed ${identifier}`);
      const preset = new EffectPreset(`shake_${identifier}`);
      applyEffectPresetSeed(preset, seed);
      return effectShakeOf(preset);
    };

    expect(shakes('EffectPreset_slash_1')).toBe('');
    expect(shakes('EffectPreset_slash_2')).toBe('soft');
    expect(shakes('EffectPreset_slash_iai')).toBe('soft');
    expect(shakes('EffectPreset_slash_3')).toBe('hard');
    expect(shakes('EffectPreset_slash_charged')).toBe('hard');
    expect(shakes('EffectPreset_crescent_wave')).toBe('soft');
    expect(shakes('EffectPreset_crescent_combo')).toBe('soft');
    for (const sword of ['', '_flame', '_frost', '_bolt', '_earth', '_dark']) {
      expect(shakes(`EffectPreset_skyblade${sword}`)).toBe('hard');
    }
  });

  it('shakes for the rounds of guns and for missiles by their grade, and lightly for an arrow that goes through and a shot of spirit', () => {
    const shot = (look: string, grade: number, lands: EffectKind = 'burst'): EffectPreset => {
      const preset = makePreset('projectile', grade);
      preset.projectileStyle = look;
      preset.impactKind = lands;
      preset.tagName = '射撃';
      return preset;
    };

    for (const look of ['bullet', 'tracer', 'missile', 'cruise'] as const) {
      expect([look, [1, 2, 3].map((grade) => effectShakeOf(shot(look, grade)))]).toEqual([look, ['', 'soft', 'hard']]);
    }
    expect([1, 2, 3].map((grade) => effectShakeOf(shot('arrow', grade, 'impact')))).toEqual(['', '', 'soft']);
    expect([1, 2, 3].map((grade) => effectShakeOf(shot('bolt', grade, 'impact')))).toEqual(['', 'soft', 'soft']);
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
