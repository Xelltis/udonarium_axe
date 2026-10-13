import { readingOf, rubyMarkupOfLine, rubyRunsOf } from '@axe/domain/chat/chat-ruby-notation';

describe('the ruby notation', () => {
  it('writes a reading over the whole word, as group ruby', () => {
    expect(rubyRunsOf('明日', 'あした')).toEqual([{ base: '明日', reading: 'あした' }]);
  });

  it('writes a reading split by bars one part over each letter, as mono ruby', () => {
    expect(rubyRunsOf('漢字', 'かん|じ')).toEqual([
      { base: '漢', reading: 'かん' },
      { base: '字', reading: 'じ' },
    ]);
    expect(rubyRunsOf('漢字', 'かん｜じ')).toHaveLength(2);
    expect(rubyRunsOf('漢字', 'かん|')).toEqual([
      { base: '漢', reading: 'かん' },
      { base: '字', reading: '' },
    ]);
  });

  it('writes a reading whose parts do not match the letters over the whole word, its bars dropped', () => {
    expect(rubyRunsOf('明日', 'あ|し|た')).toEqual([{ base: '明日', reading: 'あした' }]);
    expect(readingOf('か|ん|じ')).toBe('かんじ');
  });

  it('counts a letter made of several characters as one', () => {
    expect(rubyRunsOf('👨‍👩‍👧字', 'かぞく|じ').map((run) => run.base)).toEqual(['👨‍👩‍👧', '字']);
  });

  it('writes a line as ruby markup, every other part through the escape given', () => {
    const escape = (text: string) => text.replace(/</g, '&lt;');

    expect(rubyMarkupOfLine('<|漢字《かん|じ》と|明日《あした》', escape)).toBe(
      '&lt;<ruby class="chat-ruby"><rb>漢</rb><rt>かん</rt><rb>字</rb><rt>じ</rt></ruby>と' +
        '<ruby class="chat-ruby"><rb>明日</rb><rt>あした</rt></ruby>'
    );
  });
});
