import { effectMoteOf } from '@axe/domain/effect/effect-motes';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

describe('effectMoteOf()', () => {
  function makePreset(tagName: string, moteStyle = ''): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.tagName = tagName;
    preset.moteStyle = moteStyle;
    return preset;
  }

  it('takes the particles from the family', () => {
    expect(effectMoteOf(makePreset('炎'))).toBe('spark');
    expect(effectMoteOf(makePreset('氷'))).toBe('frost');
    expect(effectMoteOf(makePreset('雷'))).toBe('arc');
    expect(effectMoteOf(makePreset('風'))).toBe('leaf');
    expect(effectMoteOf(makePreset('闇'))).toBe('haze');
    expect(effectMoteOf(makePreset('聖'))).toBe('spark');
  });

  it('takes what is given outright over that', () => {
    expect(effectMoteOf(makePreset('炎', 'frost'))).toBe('frost');
    expect(effectMoteOf(makePreset('炎', 'none'))).toBe('none');
  });

  it('falls back to the default for a choice or a family it does not know', () => {
    expect(effectMoteOf(makePreset('炎', 'とんでもない値'))).toBe('spark');
    expect(effectMoteOf(makePreset('ドラゴン'))).toBe('spark');
  });
});
