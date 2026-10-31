import { toGraphemes } from '@axe/core/util/graphemes';
import { graphemeEnds, typedLineOf, typedPartsOf, typedTextOf } from '@axe/features/visual-novel/visual-novel-text';

describe('typedLineOf', () => {
  it('types only the letters a reader sees, never the notation', () => {
    const line = typedLineOf('今日は|天気《てんき》だ');
    expect(line.text).toBe('今日は天気だ');
    expect(line.ends.length).toBe(6);
  });

  it('types a stamp put inside the line whole, as one letter', () => {
    const line = typedLineOf('あ［了解:seal:ok］い');
    expect(line.ends.length).toBe(3);
    expect(typedPartsOf(line, 2)).toEqual([
      { text: 'あ', reading: '', decoration: null },
      { text: '［了解］', reading: '', decoration: null, stamp: 'seal:ok' },
    ]);
  });

  it('gives a line with no notation the letters it always had', () => {
    const line = typedLineOf('あ🎉い');
    expect(line.text).toBe('あ🎉い');
    expect(line.ends).toEqual(graphemeEnds('あ🎉い'));
  });

  it('shows the word with a reading a letter at a time, the reading over it from the first', () => {
    const line = typedLineOf('あ|漢字《かんじ》い');
    expect(typedPartsOf(line, 0)).toEqual([]);
    expect(typedPartsOf(line, 1)).toEqual([{ text: 'あ', reading: '', decoration: null }]);
    expect(typedPartsOf(line, 2)).toEqual([
      { text: 'あ', reading: '', decoration: null },
      { text: '漢', reading: 'かんじ', decoration: null },
    ]);
    expect(typedPartsOf(line, 3)).toEqual([
      { text: 'あ', reading: '', decoration: null },
      { text: '漢字', reading: 'かんじ', decoration: null },
    ]);
    expect(typedPartsOf(line, 4)).toBe(line.parts);
  });

  it('types a decorated word without its marks, the part typed so far drawn as the whole will be', () => {
    const line = typedLineOf('あ**強い**');
    expect(line.text).toBe('あ強い');
    expect(typedPartsOf(line, 2)).toEqual([
      { text: 'あ', reading: '', decoration: null },
      { text: '強', reading: '', decoration: line.parts[1].decoration },
    ]);
    expect(line.parts[1].decoration?.bold).toBe(true);
  });

  it('keeps the text and the runs at the same place in the line', () => {
    const line = typedLineOf('𩸽を|焼《や》く👨‍👩‍👧‍👦|です《desu》');
    for (let typed = 0; typed <= line.ends.length; typed++) {
      const shown = typedPartsOf(line, typed)
        .map((part) => part.text)
        .join('');
      expect(shown).toBe(typedTextOf(line, typed));
    }
    expect(typedTextOf(line, line.ends.length)).toBe('𩸽を焼く👨‍👩‍👧‍👦です');
  });
});

describe('toGraphemes()', () => {
  it('returns nothing for an empty string', () => {
    expect(toGraphemes('')).toEqual([]);
  });

  it('splits ordinary text a character at a time', () => {
    expect(toGraphemes('こんにちは')).toEqual(['こ', 'ん', 'に', 'ち', 'は']);
  });

  it('keeps a surrogate pair together', () => {
    expect(toGraphemes('やった🎉')).toEqual(['や', 'っ', 'た', '🎉']);
  });

  it('keeps a combined emoji together', () => {
    const graphemes = toGraphemes('👨‍👩‍👧');
    expect(graphemes.join('')).toBe('👨‍👩‍👧');
    expect(graphemes.length).toBeLessThanOrEqual(3);
  });

  it('never leaves a broken character partway through', () => {
    const graphemes = toGraphemes('あ🎉い');
    for (let i = 0; i <= graphemes.length; i++) {
      expect(graphemes.slice(0, i).join('')).not.toContain('�');
      expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(graphemes.slice(0, i).join(''))).toBe(false);
    }
  });
});

describe('graphemeEnds', () => {
  it('gives nothing for an empty line', () => {
    expect(graphemeEnds('')).toEqual([]);
  });

  it('counts one unit per letter of the alphabet', () => {
    expect(graphemeEnds('abc')).toEqual([1, 2, 3]);
  });

  it('counts a Japanese character as one letter of one unit', () => {
    expect(graphemeEnds('あいう')).toEqual([1, 2, 3]);
  });

  it('cuts a line at every end and never through a letter', () => {
    for (const line of ['abc', 'あいう', '👨‍👩‍👧‍👦です', 'étude', '𩸽を焼く']) {
      const ends = graphemeEnds(line);
      const cuts = ends.map((end) => line.slice(0, end));
      expect(cuts[cuts.length - 1]).toBe(line);
      expect(cuts.map((cut, index) => cut.length === ends[index]).every(Boolean)).toBe(true);
      expect(cuts).toEqual(toGraphemes(line).map((_, index, all) => all.slice(0, index + 1).join('')));
    }
  });
});
