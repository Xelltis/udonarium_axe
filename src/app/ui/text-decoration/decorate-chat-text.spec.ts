import {
  applyRubyMarkup,
  decorateChatStyleText,
  decorateQuoteLines,
  escapeHtml,
  splitRubyNotation,
} from '@axe/ui/text-decoration/decorate-chat-text';

describe('decorate-chat-text', () => {
  describe('escapeHtml', () => {
    it('escapes the html special characters', () => {
      expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    });

    it('turns a non-string into text', () => {
      expect(escapeHtml(42)).toBe('42');
      expect(escapeHtml(null)).toBe('null');
    });
  });

  describe('applyRubyMarkup', () => {
    it('turns the ruby notation into a ruby element', () => {
      const result = applyRubyMarkup('|漢字《かんじ》');
      expect(result).toBe('<ruby class="chat-ruby"><rb>漢字</rb><rt>かんじ</rt></ruby>');
    });

    it('accepts the full-width pipe too', () => {
      const result = applyRubyMarkup('｜熟語《じゅくご》');
      expect(result).toBe('<ruby class="chat-ruby"><rb>熟語</rb><rt>じゅくご</rt></ruby>');
    });
  });

  describe('splitRubyNotation', () => {
    it('gives nothing for an empty line', () => {
      expect(splitRubyNotation('')).toEqual([]);
    });

    it('keeps a line with no notation as one plain run', () => {
      expect(splitRubyNotation('こんにちは')).toEqual([{ text: 'こんにちは', reading: '' }]);
    });

    it('cuts the words with a reading out of the text around them', () => {
      expect(splitRubyNotation('今日の|天気《てんき》は｜晴《は》れ')).toEqual([
        { text: '今日の', reading: '' },
        { text: '天気', reading: 'てんき' },
        { text: 'は', reading: '' },
        { text: '晴', reading: 'は' },
        { text: 'れ', reading: '' },
      ]);
    });

    it('leaves the text as it is written rather than escaping it', () => {
      expect(splitRubyNotation('<b>|&《アンド》')).toEqual([
        { text: '<b>', reading: '' },
        { text: '&', reading: 'アンド' },
      ]);
    });

    it('reads the notation where the chat does', () => {
      for (const line of [
        'a|漢字《かんじ》b',
        '|漢 字《かんじ》',
        '|漢字《》',
        '||漢字《かんじ》',
        '一\\s二|三《さん》',
      ]) {
        const html = splitRubyNotation(line)
          .map((part) =>
            part.reading.length > 0
              ? `<ruby class="chat-ruby"><rb>${part.text}</rb><rt>${part.reading}</rt></ruby>`
              : part.text
          )
          .join('');
        expect(html).toBe(applyRubyMarkup(line));
      }
    });
  });

  describe('decorateQuoteLines', () => {
    it('wraps a line beginning with an angle bracket in a quote element', () => {
      expect(decorateQuoteLines('hello\n&gt; quoted\nworld')).toBe(
        'hello\n<span class="chat-quote">quoted</span>\nworld'
      );
    });

    it('gathers consecutive quoted lines into one quote', () => {
      expect(decorateQuoteLines('&gt; line 1\n&gt; line 2')).toBe('<span class="chat-quote">line 1<br>line 2</span>');
    });

    it('leaves text with no quote marker alone', () => {
      expect(decorateQuoteLines('plain text')).toBe('plain text');
    });
  });

  describe('decorateChatStyleText, all of it at once', () => {
    it('escapes, then rubies, then quotes', () => {
      const input = '> @勇者\n> こんにちは|世界《せかい》';
      const result = decorateChatStyleText(input);
      expect(result).toContain('<span class="chat-quote">');
      expect(result).toContain('@勇者');
      expect(result).toContain('<ruby class="chat-ruby"><rb>世界</rb><rt>せかい</rt></ruby>');
    });

    it('escapes html-looking input inside a quote before decorating it', () => {
      const result = decorateChatStyleText('> <b>not bold</b>');
      expect(result).toBe('<span class="chat-quote">&lt;b&gt;not bold&lt;/b&gt;</span>');
    });
  });
});
