import { paletteRowsOf } from '@axe/domain/chat/palette-rows';
import {
  highlightSearchTerms,
  type PaletteSearchResult,
  searchPaletteRows,
} from '@axe/features/chat/chat-palette/chat-palette-search';

function rows(text: string) {
  return paletteRowsOf(text.split('\n'));
}

function lines(results: PaletteSearchResult[]): string[] {
  return results.map((result) => result.row.text);
}

describe('searchPaletteRows()', () => {
  it('finds nothing to show until something is searched for', () => {
    expect(searchPaletteRows(rows('2d6 攻撃'), '')).toEqual([]);
    expect(searchPaletteRows(rows('2d6 攻撃'), '　 ')).toEqual([]);
  });

  it('keeps the lines holding what is searched for, whatever the width or case it is written in', () => {
    const palette = rows('２Ｄ６＋３ 攻撃\n1d100<=50 目星\nCCB<=60 回避');

    expect(lines(searchPaletteRows(palette, '2d6'))).toEqual(['２Ｄ６＋３ 攻撃']);
    expect(lines(searchPaletteRows(palette, 'ｃｃｂ'))).toEqual(['CCB<=60 回避']);
  });

  it('keeps only the lines holding every word searched for', () => {
    const palette = rows('2d6 攻撃\n2d6 回避\n1d6 攻撃');

    expect(lines(searchPaletteRows(palette, '2d6　攻撃'))).toEqual(['2d6 攻撃']);
  });

  it('leaves out headings, settings and blank lines, which are not said', () => {
    const palette = rows('◆攻撃\n//攻撃力=3\n\n2d6+{攻撃力} 攻撃');

    expect(lines(searchPaletteRows(palette, '攻撃'))).toEqual(['2d6+{攻撃力} 攻撃']);
  });

  it('puts the lines that begin with it first, then those where it comes earlier, then the palette order', () => {
    const palette = rows('1d100 回避\n回避 1d100\n2d6 回避\nCCB 回避');

    expect(lines(searchPaletteRows(palette, '回避'))).toEqual(['回避 1d100', '2d6 回避', 'CCB 回避', '1d100 回避']);
  });

  it('counts a line indented before what is searched for as beginning with it', () => {
    const palette = rows('2d6 回避\n  回避 1d100');

    expect(lines(searchPaletteRows(palette, '回避'))).toEqual(['  回避 1d100', '2d6 回避']);
  });

  it('names the heading each line sits under, and none for lines before the first heading', () => {
    const palette = rows('2d6 攻撃\n◆戦闘\n1d6 攻撃');

    expect(searchPaletteRows(palette, '攻撃').map((result) => result.heading)).toEqual(['', '戦闘']);
  });

  it('marks where each word searched for stands, in the line as it is written', () => {
    const [result] = searchPaletteRows(rows('２Ｄ６＋３ 攻撃'), '2d6 攻撃');

    expect(result.segments).toEqual([
      { text: '２Ｄ６', hit: true },
      { text: '＋３ ', hit: false },
      { text: '攻撃', hit: true },
    ]);
  });
});

describe('highlightSearchTerms()', () => {
  it('marks every place a word stands, running overlapping places together', () => {
    expect(highlightSearchTerms('aaa', ['aa'])).toEqual([{ text: 'aaa', hit: true }]);
    expect(highlightSearchTerms('d6 d6', ['d6'])).toEqual([
      { text: 'd6', hit: true },
      { text: ' ', hit: false },
      { text: 'd6', hit: true },
    ]);
  });

  it('leaves a line unmarked where no word stands in it', () => {
    expect(highlightSearchTerms('2d6', [])).toEqual([{ text: '2d6', hit: false }]);
    expect(highlightSearchTerms('2d6', ['xyz'])).toEqual([{ text: '2d6', hit: false }]);
  });

  it('gives nothing for an empty line', () => {
    expect(highlightSearchTerms('', ['a'])).toEqual([]);
  });
});
