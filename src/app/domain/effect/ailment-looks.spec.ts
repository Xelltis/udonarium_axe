import { AILMENT_BEAT_S } from '@axe/domain/effect/ailment-beats';
import { AILMENT_LOOKS, curseLookOf, isAilmentLook, isCurseAlone, takesHoldAt } from '@axe/domain/effect/ailment-looks';
import { EFFECT_MOTE_OPTIONS, effectMoteOf } from '@axe/domain/effect/effect-motes';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

function curseOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'curse';
  preset.tagName = '状態異常';
  Object.assign(preset, fields);
  return preset;
}

describe('curseLookOf()', () => {
  it('draws a curse as the state its particles name', () => {
    for (const look of AILMENT_LOOKS) expect(curseLookOf(curseOf({ moteStyle: look }))).toBe(look);
  });

  it('draws a curse run through by a current as a paralysis, named outright or given by its family', () => {
    expect(curseLookOf(curseOf({ moteStyle: 'arc' }))).toBe('shock');
    expect(curseLookOf(curseOf({ tagName: '雷' }))).toBe('shock');
  });

  it('draws anything else as the curse itself', () => {
    expect(curseLookOf(curseOf())).toBe('curse');
    expect(curseLookOf(curseOf({ moteStyle: 'haze' }))).toBe('curse');
    expect(curseLookOf(curseOf({ moteStyle: 'a state this version has never heard of' }))).toBe('curse');
    expect(curseLookOf(curseOf({ tagName: '闇' }))).toBe('curse');
  });

  it('tells the name of a state from any other choice of particles', () => {
    expect(isAilmentLook('sleep')).toBe(true);
    expect(isAilmentLook('arc')).toBe(false);
    expect(isAilmentLook('')).toBe(false);
    expect(isAilmentLook(undefined)).toBe(false);
  });
});

describe('the name of a state, read as a choice of particles', () => {
  it('is no choice at all, so a version that has never heard of it falls back on the family and plays the plain curse', () => {
    for (const look of AILMENT_LOOKS) {
      expect(effectMoteOf(curseOf({ moteStyle: look }))).toBe('haze');
      expect(EFFECT_MOTE_OPTIONS).not.toContain(look);
    }
  });

  it('leaves a paralysis under the name it always had, so an older version goes on drawing it as one', () => {
    expect(effectMoteOf(curseOf({ moteStyle: 'arc' }))).toBe('arc');
  });
});

describe('isCurseAlone()', () => {
  it('holds for a curse on its own and not for a run with one among its stages', () => {
    const run = curseOf();
    run.stages = JSON.stringify([{ role: 'impact', kind: 'curse', durationMs: 600 }]);

    expect(isCurseAlone(curseOf())).toBe(true);
    expect(isCurseAlone(run)).toBe(false);
    expect(isCurseAlone(curseOf({ kind: 'burst' }))).toBe(false);
  });
});

describe('takesHoldAt()', () => {
  it('takes hold within the playback of every look, however short it is', () => {
    for (const look of [...AILMENT_LOOKS, 'shock', 'curse'] as const) {
      for (const duration of [0.4, 1.4, 5.5]) {
        expect(takesHoldAt(look, duration)).toBeGreaterThan(0);
        expect(takesHoldAt(look, duration)).toBeLessThan(duration * 0.6);
      }
    }
  });

  it('closes the stone over the head later than a band shuts over the eyes', () => {
    expect(takesHoldAt('petrify', 1.4)).toBeGreaterThan(takesHoldAt('blind', 1.4));
  });

  it('keeps a beat of between half a second and a second and a quarter for every look', () => {
    for (const every of Object.values(AILMENT_BEAT_S)) {
      expect(every).toBeGreaterThanOrEqual(0.4);
      expect(every).toBeLessThanOrEqual(1.25);
    }
  });
});
