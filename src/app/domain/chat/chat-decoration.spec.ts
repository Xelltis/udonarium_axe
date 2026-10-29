import {
  CHAT_COLORS,
  CHAT_TAG_NAMES,
  chatColorHalo,
  ChatDecoration,
  chatDecorationLayout,
  chatDecorationMarks,
  chatDecorationMarkup,
  chatFontsIn,
  decoratedRunsOf,
  leaningPiecesOf,
  withoutChatDecoration,
  wrapChatSelection,
} from '@axe/domain/chat/chat-decoration';

const PLAIN: ChatDecoration = { bold: false, italic: false, strike: false, size: null, font: null, color: null };

function decorated(overrides: Partial<ChatDecoration>): ChatDecoration {
  return { ...PLAIN, ...overrides };
}

describe('decoratedRunsOf', () => {
  it('leaves a line with no marks as one plain run', () => {
    expect(decoratedRunsOf('こんにちは')).toEqual([{ text: 'こんにちは', decoration: null }]);
    expect(decoratedRunsOf('')).toEqual([]);
  });

  it('makes what two stars enclose bold', () => {
    expect(decoratedRunsOf('今日は**晴れ**です')).toEqual([
      { text: '今日は', decoration: null },
      { text: '晴れ', decoration: decorated({ bold: true }) },
      { text: 'です', decoration: null },
    ]);
  });

  it('writes a stamp put inside a line as its name, when the decorations are taken out', () => {
    expect(withoutChatDecoration('**了解**［了解:seal:ok］')).toBe('了解［了解］');
  });

  it('leaves a lone pair of stars, and stars a line apart, as they were typed', () => {
    expect(withoutChatDecoration('**だけ')).toBe('**だけ');
    expect(withoutChatDecoration('**a**b**')).toBe('ab**');
    expect(decoratedRunsOf('**一行目\n二行目**')).toEqual([{ text: '**一行目\n二行目**', decoration: null }]);
  });

  it('applies a tag closed by its own name or by [/], in any of the three languages', () => {
    const mincho = decorated({ font: 'mincho' });
    expect(decoratedRunsOf('[明朝]春[/明朝]')).toEqual([{ text: '春', decoration: mincho }]);
    expect(decoratedRunsOf('[明朝]春[/]')).toEqual([{ text: '春', decoration: mincho }]);
    expect(decoratedRunsOf('[Mincho]spring[/mincho]')).toEqual([{ text: 'spring', decoration: mincho }]);
    expect(decoratedRunsOf('[명조]봄[/]')).toEqual([{ text: '봄', decoration: mincho }]);
    expect(decoratedRunsOf('［赤］火［／］')).toEqual([
      { text: '火', decoration: decorated({ color: CHAT_COLORS.red }) },
    ]);
  });

  it('leaves a tag never closed, a close with nothing open, and a name it does not know as text', () => {
    expect(withoutChatDecoration('[赤]チームの勝ち')).toBe('[赤]チームの勝ち');
    expect(withoutChatDecoration('おしまい[/]')).toBe('おしまい[/]');
    expect(withoutChatDecoration('[注意]足元[/注意]')).toBe('[注意]足元[/注意]');
    expect(withoutChatDecoration('7[3,4] → 7')).toBe('7[3,4] → 7');
  });

  it('closes a named tag where it is named, though another was opened after it', () => {
    expect(decoratedRunsOf('[赤]a[大]b[/赤]c[/大]')).toEqual([
      { text: 'a', decoration: decorated({ color: CHAT_COLORS.red }) },
      { text: 'b', decoration: decorated({ color: CHAT_COLORS.red, size: 'large' }) },
      { text: 'c', decoration: decorated({ size: 'large' }) },
    ]);
  });

  it('nests tags, the font, size and colour opened last taking over inside', () => {
    expect(decoratedRunsOf('[赤]a[青]b[/]c[/]')).toEqual([
      { text: 'a', decoration: decorated({ color: CHAT_COLORS.red }) },
      { text: 'b', decoration: decorated({ color: CHAT_COLORS.blue }) },
      { text: 'c', decoration: decorated({ color: CHAT_COLORS.red }) },
    ]);
    expect(decoratedRunsOf('**[斜体][取消線][小]x[/][/][/]**')).toEqual([
      { text: 'x', decoration: decorated({ bold: true, italic: true, strike: true, size: 'small' }) },
    ]);
  });

  it('takes a colour written as #rgb or #rrggbb, and nothing else after the #', () => {
    expect(decoratedRunsOf('[#F80]x[/]')[0].decoration?.color).toBe('#ff8800');
    expect(decoratedRunsOf('[#12ab34]x[/]')[0].decoration?.color).toBe('#12ab34');
    expect(withoutChatDecoration('[#zzz]x[/]')).toBe('[#zzz]x[/]');
    expect(withoutChatDecoration('[#1]x[/]')).toBe('[#1]x[/]');
  });

  it('reads a long line of brackets that close nothing as quickly as any other', () => {
    const line = '['.repeat(50_000);
    const started = performance.now();

    expect(withoutChatDecoration(line)).toBe(line);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('writes a star or a bracket itself after a backslash', () => {
    expect(withoutChatDecoration('\\**not bold\\**')).toBe('**not bold**');
    expect(withoutChatDecoration('\\[赤]x[/]')).toBe('[赤]x[/]');
  });

  it('keeps a backslash before anything that would not take effect, as lines written before have them', () => {
    expect(withoutChatDecoration('パスは C:\\[共有]\\memo')).toBe('パスは C:\\[共有]\\memo');
    expect(withoutChatDecoration('\\*o*/')).toBe('\\*o*/');
    expect(withoutChatDecoration('a\\*b')).toBe('a\\*b');
    expect(withoutChatDecoration('末尾\\')).toBe('末尾\\');
    expect(withoutChatDecoration('\\[/赤] と \\[]')).toBe('[/赤] と \\[]');
  });

  it('keeps the ruby notation inside a decorated run as it was written', () => {
    expect(decoratedRunsOf('[明朝]|明日《あした》[/]')).toEqual([
      { text: '|明日《あした》', decoration: decorated({ font: 'mincho' }) },
    ]);
  });
});

describe('leaningPiecesOf', () => {
  it('keeps a word whole, a mark that opens with what follows and one that closes with what goes before', () => {
    expect(leaningPiecesOf('Hello, world!')).toEqual(['Hello,', ' ', 'world!']);
    expect(leaningPiecesOf('「はい」と言った。')).toEqual(['「は', 'い」', 'と', '言っ', 'た。']);
    expect(leaningPiecesOf('don’t 42%')).toEqual(['don’t', ' ', '42', '%']);
  });

  it('keeps a letter drawn of several characters whole', () => {
    expect(leaningPiecesOf('👨‍👩‍👧が')).toEqual(['👨‍👩‍👧', 'が']);
  });

  it('gives back what it was given, piece by piece', () => {
    const line = '  (a) 「b」 c。  ';
    expect(leaningPiecesOf(line).join('')).toBe(line);
  });
});

describe('chatFontsIn', () => {
  it('names each font a line is drawn in once', () => {
    expect(chatFontsIn(decoratedRunsOf('[明朝]a[/][手書き]b[/][明朝]c[/]'))).toEqual(['mincho', 'hand']);
    expect(chatFontsIn(decoratedRunsOf('[明朝]閉じない'))).toEqual([]);
  });
});

describe('chatDecorationMarkup', () => {
  const escape = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  it('puts each decorated run in a span of its classes and colour, escaping every piece', () => {
    expect(chatDecorationMarkup(decoratedRunsOf('a**<b>**[赤][明朝]c[/][/]'), escape)).toBe(
      'a<span class="chat-deco chat-deco-bold">&lt;b&gt;</span>' +
        `<span class="chat-deco chat-font-mincho" style="color: ${CHAT_COLORS.red}">c</span>`
    );
  });

  it('gives each line of a run its own span, so no span runs over a break', () => {
    expect(chatDecorationMarkup(decoratedRunsOf('[大]a\nb[/]'), escape)).toBe(
      '<span class="chat-deco chat-size-large">a</span>\n<span class="chat-deco chat-size-large">b</span>'
    );
  });

  it('cuts a leaning run into the pieces it may break between, the spaces drawn upright', () => {
    expect(chatDecorationMarkup(decoratedRunsOf('[斜体]go home。あい[/]'), escape)).toBe(
      '<span class="chat-deco chat-deco-italic">go</span>' +
        '<span class="chat-deco"> </span>' +
        '<span class="chat-deco chat-deco-italic">home。</span>' +
        '<span class="chat-deco chat-deco-italic">あ</span>' +
        '<span class="chat-deco chat-deco-italic">い</span>'
    );
  });

  it('draws white and black, and any colour as light or as dark, with a thin edge of the other', () => {
    const white = chatDecorationMarkup(decoratedRunsOf('[白]a[/]'), escape);
    const black = chatDecorationMarkup(decoratedRunsOf('[黒]a[/]'), escape);

    expect(white).toContain(`color: ${CHAT_COLORS.white}; text-shadow: ${chatColorHalo(CHAT_COLORS.white)}`);
    expect(black).toContain(`color: ${CHAT_COLORS.black}; text-shadow: ${chatColorHalo(CHAT_COLORS.black)}`);
    expect(chatColorHalo(CHAT_COLORS.white)).toContain('rgb(0 0 0');
    expect(chatColorHalo(CHAT_COLORS.black)).toContain('rgb(255 255 255');
    expect(chatColorHalo('#ffe')).toContain('rgb(0 0 0');
    for (const color of [CHAT_COLORS.red, CHAT_COLORS.yellow, CHAT_COLORS.blue, CHAT_COLORS.gray]) {
      expect(chatColorHalo(color), color).toBeNull();
    }
    expect(chatColorHalo('white')).toBeNull();
  });

  it('leaves a quote mark that starts a line outside the span', () => {
    expect(chatDecorationMarkup(decoratedRunsOf('[赤]> 引用\n> 続き[/]'), escape)).toBe(
      `&gt; <span class="chat-deco" style="color: ${CHAT_COLORS.red}">引用</span>\n` +
        `&gt; <span class="chat-deco" style="color: ${CHAT_COLORS.red}">続き</span>`
    );
    expect(chatDecorationMarkup(decoratedRunsOf('a[赤]>b[/]'), escape)).toBe(
      `a<span class="chat-deco" style="color: ${CHAT_COLORS.red}">&gt;b</span>`
    );
  });
});

describe('the marks a button writes', () => {
  it('writes stars for bold and the first name of the reader’s language for the rest', () => {
    expect(chatDecorationMarks('bold', 'ja')).toEqual({ open: '**', close: '**' });
    expect(chatDecorationMarks('font:mincho', 'ja')).toEqual({ open: '[明朝]', close: '[/明朝]' });
    expect(chatDecorationMarks('color:red', 'en')).toEqual({ open: '[red]', close: '[/red]' });
    expect(chatDecorationMarks('huge', 'ko')).toEqual({ open: '[아주크게]', close: '[/아주크게]' });
  });

  it('writes marks that read back as what the button meant, in every language', () => {
    for (const key of Object.keys(CHAT_TAG_NAMES) as (keyof typeof CHAT_TAG_NAMES)[]) {
      for (const language of ['ja', 'en', 'ko'] as const) {
        const { open, close } = chatDecorationMarks(key, language);
        const [run] = decoratedRunsOf(`${open}x${close}`);
        expect(run.text, `${key} in ${language}`).toBe('x');
        expect(run.decoration, `${key} in ${language}`).not.toBeNull();
      }
    }
  });

  it('wraps the selection and keeps it selected, or puts the caret between the marks', () => {
    expect(wrapChatSelection('今日は晴れ', 3, 5, { open: '**', close: '**' })).toEqual({
      text: '今日は**晴れ**',
      selectionStart: 5,
      selectionEnd: 7,
    });
    expect(wrapChatSelection('ab', 1, 1, { open: '[赤]', close: '[/赤]' })).toEqual({
      text: 'a[赤][/赤]b',
      selectionStart: 4,
      selectionEnd: 4,
    });
  });

  it('stars each line of a selection over several, as stars only pair within a line', () => {
    const wrapped = wrapChatSelection('>a\nb\n\nc<', 1, 7, { open: '**', close: '**' });

    expect(wrapped).toEqual({ text: '>**a**\n**b**\n\n**c**<', selectionStart: 3, selectionEnd: 17 });
    expect(withoutChatDecoration(wrapped.text)).toBe('>a\nb\n\nc<');
    expect(wrapChatSelection('a\nb', 0, 3, { open: '[赤]', close: '[/赤]' }).text).toBe('[赤]a\nb[/赤]');
  });
});

describe('chatDecorationLayout', () => {
  const marksOf = (text: string) =>
    chatDecorationLayout(text).marks.map((mark) => [mark.kind, text.slice(mark.from, mark.to), mark.paired]);

  it('places the marks that take effect and the stretch they decorate', () => {
    const text = 'a **b** [赤]c[/]';
    const layout = chatDecorationLayout(text);
    expect(marksOf(text)).toEqual([
      ['stars', '**', true],
      ['stars', '**', true],
      ['open', '[赤]', true],
      ['close', '[/]', true],
    ]);
    expect(layout.runs.map((run) => [text.slice(run.from, run.to), run.decoration.bold, run.decoration.color])).toEqual(
      [
        ['b', true, null],
        ['c', false, '#e5484d'],
      ]
    );
  });

  it('says which mark each is paired with', () => {
    expect(chatDecorationLayout('**a** [赤]b[/]').marks.map((mark) => mark.partner)).toEqual([1, 0, 3, 2]);
    expect(chatDecorationLayout('**a').marks.map((mark) => mark.partner)).toEqual([-1]);
  });

  it('marks what is left unpaired, which is drawn as typed', () => {
    expect(marksOf('**a [赤]b')).toEqual([
      ['stars', '**', false],
      ['open', '[赤]', false],
    ]);
    expect(chatDecorationLayout('**a [赤]b').runs).toEqual([]);
  });

  it('places the backslash that keeps a mark as typed', () => {
    const text = '\\**a**';
    expect(marksOf(text)).toEqual([
      ['escape', '\\', true],
      ['stars', '**', false],
    ]);
  });

  it('decorates each letter as the line is drawn', () => {
    const text = '[太字]x **y[小]z[/小]** w[/太字] \\[赤]v';
    const placed = chatDecorationLayout(text).runs.flatMap((run) =>
      [...text.slice(run.from, run.to)].map((letter) => [letter, run.decoration])
    );
    const drawn = decoratedRunsOf(text)
      .filter((run) => run.decoration !== null)
      .flatMap((run) => [...run.text].map((letter) => [letter, run.decoration]));
    expect(placed).toEqual(drawn);
  });
});
