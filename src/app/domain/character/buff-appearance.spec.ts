import {
  BUFF_COLORS,
  isBuffColorToken,
  parseBuffAppearance,
  resolveBuffColor,
} from '@axe/domain/character/buff-appearance';

describe('resolveBuffColor()', () => {
  it('turns a colour name from a palette into a colour', () => {
    expect(resolveBuffColor('red')).toBe(BUFF_COLORS[0].hex);
    expect(resolveBuffColor('RED')).toBe(BUFF_COLORS[0].hex);
  });

  it('takes a Japanese colour name too', () => {
    expect(resolveBuffColor('赤')).toBe(resolveBuffColor('red'));
    expect(resolveBuffColor('青')).toBe(resolveBuffColor('blue'));
    expect(resolveBuffColor('灰')).toBe(resolveBuffColor('grey'));
  });

  it('takes a hexadecimal colour as it is', () => {
    expect(resolveBuffColor('#A0C')).toBe('#a0c');
    expect(resolveBuffColor('#1B2C3D')).toBe('#1b2c3d');
  });

  it('returns nothing for a reset and for anything it does not know', () => {
    expect(resolveBuffColor('既定')).toBe('');
    expect(resolveBuffColor('こんな色は無い')).toBe('');
    expect(resolveBuffColor('')).toBe('');
  });
});

describe('isBuffColorToken()', () => {
  it('is true only for what it can read as a colour', () => {
    expect(isBuffColorToken('green')).toBe(true);
    expect(isBuffColorToken('#fff')).toBe(true);
    expect(isBuffColorToken('既定')).toBe(true);
    expect(isBuffColorToken('none')).toBe(false);
    expect(isBuffColorToken('なし')).toBe(false);
    expect(isBuffColorToken('☠️')).toBe(false);
    expect(isBuffColorToken('')).toBe(false);
  });
});

describe('parseBuffAppearance()', () => {
  it('sorts a colour from an icon whichever order they come in', () => {
    expect(parseBuffAppearance(['red', '☠️'])).toEqual({ color: resolveBuffColor('red'), icon: '☠️' });
    expect(parseBuffAppearance(['☠️', 'red'])).toEqual({ color: resolveBuffColor('red'), icon: '☠️' });
  });

  it('returns the one that was given', () => {
    expect(parseBuffAppearance(['blue'])).toEqual({ color: resolveBuffColor('blue') });
    expect(parseBuffAppearance(['🔥'])).toEqual({ icon: '🔥' });
  });

  it('returns a reset as an empty colour', () => {
    expect(parseBuffAppearance(['既定'])).toEqual({ color: '' });
  });

  it('reads none as the timing that never runs out, not as a reset of the colour', () => {
    expect(parseBuffAppearance(['none'])).toEqual({ timing: 'none' });
    expect(parseBuffAppearance(['なし', '既定'])).toEqual({ timing: 'none', color: '' });
  });

  it('returns nothing when neither is given', () => {
    expect(parseBuffAppearance([])).toEqual({});
    expect(parseBuffAppearance(['', '  '])).toEqual({});
  });

  it('reads the moment the effect moves at from a field marked 発生: or tick:, wherever it comes', () => {
    expect(parseBuffAppearance(['red', '発生:手番終了', '@術者'])).toEqual({
      color: resolveBuffColor('red'),
      effectTiming: 'turnEnd',
      trigger: '術者',
    });
    expect(parseBuffAppearance(['none', 'tick:turnStart'])).toEqual({ timing: 'none', effectTiming: 'turnStart' });
  });

  it('keeps the countdown timing and the moment of the effect apart', () => {
    expect(parseBuffAppearance(['手番開始', '発生:手番終了'])).toEqual({
      timing: 'turnStart',
      effectTiming: 'turnEnd',
    });
  });

  it('takes a marked field it cannot read for neither a moment nor an icon', () => {
    expect(parseBuffAppearance(['発生:いつか'])).toEqual({});
    expect(parseBuffAppearance(['発生:none', '☠️'])).toEqual({ icon: '☠️' });
  });

  describe('the words that mark a buff or a debuff (acceptance 3)', () => {
    it.each([
      ['デバフ', 'debuff'],
      ['debuff', 'debuff'],
      ['バフ', 'buff'],
      ['buff', 'buff'],
    ])('reads %s as the kind and never as an icon', (word, kind) => {
      expect(parseBuffAppearance([word])).toEqual({ kind });
    });

    it('reads the kind wherever it comes among the colour, the icon and the timing', () => {
      expect(parseBuffAppearance(['red', 'デバフ', '☠', 'none'])).toEqual({
        color: resolveBuffColor('red'),
        kind: 'debuff',
        icon: '☠',
        timing: 'none',
      });
    });

    it('leaves the kind out where no such word is written', () => {
      expect('kind' in parseBuffAppearance(['red', '☠'])).toBe(false);
    });

    it('still takes a word that only holds one of them for an icon', () => {
      expect(parseBuffAppearance(['デバフ中'])).toEqual({ icon: 'デバフ中' });
    });
  });
});
