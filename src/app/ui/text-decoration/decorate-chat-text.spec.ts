import { chatFontWanted$ } from '@axe/core/event/domain-events';
import { CHAT_COLORS } from '@axe/domain/chat/chat-decoration';
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

    it('writes a reading split by bars one part over each letter, an escaped letter kept whole', () => {
      expect(applyRubyMarkup('|漢字《かん|じ》')).toBe(
        '<ruby class="chat-ruby"><rb>漢</rb><rt>かん</rt><rb>字</rb><rt>じ</rt></ruby>'
      );
      expect(applyRubyMarkup('|&amp;字《アンド|じ》')).toBe(
        '<ruby class="chat-ruby"><rb>&amp;</rb><rt>アンド</rt><rb>字</rb><rt>じ</rt></ruby>'
      );
    });
  });

  describe('splitRubyNotation', () => {
    it('gives nothing for an empty line', () => {
      expect(splitRubyNotation('')).toEqual([]);
    });

    it('keeps a line with no notation as one plain run', () => {
      expect(splitRubyNotation('こんにちは')).toEqual([{ text: 'こんにちは', reading: '', decoration: null }]);
    });

    it('cuts the words with a reading out of the text around them', () => {
      expect(splitRubyNotation('今日の|天気《てんき》は｜晴《は》れ')).toEqual([
        { text: '今日の', reading: '', decoration: null },
        { text: '天気', reading: 'てんき', decoration: null },
        { text: 'は', reading: '', decoration: null },
        { text: '晴', reading: 'は', decoration: null },
        { text: 'れ', reading: '', decoration: null },
      ]);
    });

    it('cuts a reading split over its letters into a run for each letter', () => {
      expect(splitRubyNotation('|漢字《かん|じ》だ')).toEqual([
        { text: '漢', reading: 'かん', decoration: null },
        { text: '字', reading: 'じ', decoration: null },
        { text: 'だ', reading: '', decoration: null },
      ]);
    });

    it('leaves the text as it is written rather than escaping it', () => {
      expect(splitRubyNotation('<b>|&《アンド》')).toEqual([
        { text: '<b>', reading: '', decoration: null },
        { text: '&', reading: 'アンド', decoration: null },
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

    it('carries the chat’s decorations onto each run, a reading included, and asks for the fonts', () => {
      const asked: string[] = [];
      const stop = chatFontWanted$.subscribe((font) => asked.push(font));

      const parts = splitRubyNotation('[明朝]春の|曙《あけぼの》[/]だ');

      stop();
      const mincho = { bold: false, italic: false, strike: false, size: null, font: 'mincho', color: null };
      expect(parts).toEqual([
        { text: '春の', reading: '', decoration: mincho },
        { text: '曙', reading: 'あけぼの', decoration: mincho },
        { text: 'だ', reading: '', decoration: null },
      ]);
      expect(asked).toEqual(['mincho']);
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

  describe('stamps put inside a line', () => {
    const markup = (stampId: string, label: string) => `<i data-id="${stampId}">${label}</i>`;

    it('draws each stamp by the markup given, escaping the words round it', () => {
      expect(decorateChatStyleText('<a>［了解:seal:ok］と［ドッ:sfx:boom］', markup)).toBe(
        '&lt;a&gt;<i data-id="seal:ok">了解</i>と<i data-id="sfx:boom">ドッ</i>'
      );
    });

    it('writes a stamp as its name, escaped, where no markup is given or it draws nothing', () => {
      expect(decorateChatStyleText('前［<了解>:seal:ok］後')).toBe('前［&lt;了解&gt;］後');
      expect(decorateChatStyleText('［了解:seal:ok］', () => null)).toBe('［了解］');
    });

    it('keeps a stamp whole in a leaning run, and inside bold', () => {
      expect(decorateChatStyleText('[斜体]あ［了解:seal:ok］[/]', markup)).toBe(
        '<span class="chat-deco chat-deco-italic">あ</span>' +
          '<span class="chat-deco chat-deco-italic"><i data-id="seal:ok">了解</i></span>'
      );
      expect(decorateChatStyleText('**［了解:seal:ok］**', markup)).toBe(
        '<span class="chat-deco chat-deco-bold"><i data-id="seal:ok">了解</i></span>'
      );
    });

    it('cuts a stamp out as a run of its own for a line shown a little at a time', () => {
      expect(splitRubyNotation('あ［了解:seal:ok］い')).toEqual([
        { text: 'あ', reading: '', decoration: null },
        { text: '［了解］', reading: '', decoration: null, stamp: 'seal:ok' },
        { text: 'い', reading: '', decoration: null },
      ]);
    });

    it('leaves a stamp this version does not know as its name in that run', () => {
      expect(splitRubyNotation('［新顔:sfx:fromthefuture］')).toEqual([
        { text: '［新顔］', reading: '', decoration: null },
      ]);
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

    it('draws the chat’s decorations round escaped and rubied text, inside a quote as well', () => {
      expect(decorateChatStyleText('> **<i>|強《つよ》く**')).toBe(
        '<span class="chat-quote"><span class="chat-deco chat-deco-bold">&lt;i&gt;' +
          '<ruby class="chat-ruby"><rb>強</rb><rt>つよ</rt></ruby>く</span></span>'
      );
      expect(decorateChatStyleText('[赤]"x"[/]')).toBe(
        `<span class="chat-deco" style="color: ${CHAT_COLORS.red}">&quot;x&quot;</span>`
      );
    });

    it('cuts a leaning run into pieces it may break between, keeping a word and its reading whole', () => {
      expect(decorateChatStyleText('[斜体]|明日《あした》は晴\\sれ[/]')).toBe(
        '<span class="chat-deco chat-deco-italic"><ruby class="chat-ruby"><rb>明日</rb><rt>あした</rt></ruby></span>' +
          '<span class="chat-deco chat-deco-italic">は</span>' +
          '<span class="chat-deco chat-deco-italic">晴</span>' +
          '<span class="chat-deco chat-deco-italic"> </span>' +
          '<span class="chat-deco chat-deco-italic">れ</span>'
      );
      expect(splitRubyNotation('[斜体]ab cd[/]').map((part) => [part.text, part.decoration?.italic])).toEqual([
        ['ab', true],
        [' ', false],
        ['cd', true],
      ]);
    });

    it('asks for the fonts a line is drawn in', () => {
      const asked: string[] = [];
      const stop = chatFontWanted$.subscribe((font) => asked.push(font));

      decorateChatStyleText('[手書き]a[/] [ドット]b[/]');

      stop();
      expect(asked).toEqual(['hand', 'pixel']);
    });
  });
});
