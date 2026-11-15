import { CLEANSING_MOTES, healLookOf, isMirror, liftsAsGrace } from '@axe/domain/effect/blessing-looks';
import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { effectMoteOf } from '@axe/domain/effect/effect-motes';

describe('the looks of a healing', () => {
  it('mends at the lowest grade, rains at the middle one and is a grace at the highest', () => {
    expect(healLookOf({ moteStyle: '', gradeLevel: 1 })).toBe('mend');
    expect(healLookOf({ moteStyle: '', gradeLevel: 2 })).toBe('rain');
    expect(healLookOf({ moteStyle: '', gradeLevel: 3 })).toBe('grace');
  });

  it('cleanses where its particles say so: purging at the lowest grade and washing above it', () => {
    expect(healLookOf({ moteStyle: CLEANSING_MOTES, gradeLevel: 1 })).toBe('purge');
    expect(healLookOf({ moteStyle: CLEANSING_MOTES, gradeLevel: 2 })).toBe('wash');
    expect(healLookOf({ moteStyle: CLEANSING_MOTES, gradeLevel: 3 })).toBe('wash');
  });

  it('draws particles it has never heard of as a healing of its grade', () => {
    expect(healLookOf({ moteStyle: 'frost', gradeLevel: 1 })).toBe('mend');
    expect(healLookOf({ moteStyle: 'unknown', gradeLevel: 3 })).toBe('grace');
  });

  it('leaves the particles of a cleansing to its family where they are asked for as particles', () => {
    expect(effectMoteOf({ moteStyle: CLEANSING_MOTES, tagName: '回復' })).toBe('frost');
  });

  it('gives each bundled healing a look of its own', () => {
    const lookOf = (identifier: string) => {
      const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.identifier === identifier)!;
      expect(seed.kind).toBe('heal');
      return healLookOf({ moteStyle: seed.moteStyle ?? '', gradeLevel: seed.grade as 1 | 2 | 3 });
    };

    expect(lookOf('EffectPreset_heal_1')).toBe('mend');
    expect(lookOf('EffectPreset_heal_2')).toBe('rain');
    expect(lookOf('EffectPreset_heal_3')).toBe('grace');
    expect(lookOf('EffectPreset_cleanse_1')).toBe('purge');
    expect(lookOf('EffectPreset_status_cure')).toBe('wash');
  });
});

describe('the looks of a barrier', () => {
  it('is a mirror at the highest grade alone', () => {
    expect(isMirror({ gradeLevel: 3 })).toBe(true);
    expect(isMirror({ gradeLevel: 2 })).toBe(false);
    expect(isMirror({ gradeLevel: 1 })).toBe(false);
  });
});

describe('liftsAsGrace()', () => {
  const heal = { isStaged: false, effectKind: 'heal', moteStyle: '', gradeLevel: 3 } as const;

  it('holds for the greatest healing on its own, and for no cleansing, lesser healing or stage of a run', () => {
    expect(liftsAsGrace(heal)).toBe(true);
    expect(liftsAsGrace({ ...heal, gradeLevel: 2 })).toBe(false);
    expect(liftsAsGrace({ ...heal, moteStyle: CLEANSING_MOTES })).toBe(false);
    expect(liftsAsGrace({ ...heal, isStaged: true })).toBe(false);
    expect(liftsAsGrace({ ...heal, effectKind: 'aura' })).toBe(false);
  });
});
