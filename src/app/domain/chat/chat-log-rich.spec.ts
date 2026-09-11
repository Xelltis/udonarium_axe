import type { ImageFile } from '@axe/core/storage/image-file';
import { exportChatLog } from '@axe/domain/chat/chat-log-export';
import { ChatLogExporter, ChatLogLine, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import { renderRichChatLog } from '@axe/domain/chat/chat-log-rich';
import { CHAT_LOG_THEME_CSS } from '@axe/domain/chat/chat-log-theme-css';
import type { DiceRollDetail } from '@axe/domain/dice/dice-roll-detail';

const MINUTE = 60 * 1000;
const BASE = new Date(2026, 8, 11, 20, 0).getTime();

function line(overrides: Partial<ChatLogLine> = {}): ChatLogLine {
  const timestamp = overrides.timestamp ?? BASE;
  return {
    name: 'アリア',
    text: 'こんばんは',
    messColor: '#aa3333',
    timestamp,
    placedAt: overrides.placedAt ?? timestamp,
    from: 'user-1',
    to: '',
    fixd: false,
    isSecret: false,
    isSendFromSelf: true,
    isDisplayable: true,
    isSentBy: () => false,
    image: null,
    attachmentImages: [],
    quoteOf: '',
    quoteOfMessage: null,
    replyTo: '',
    replyToMessage: null,
    vnEmote: '',
    isSystemMessage: false,
    isDicebot: false,
    rollDetail: null,
    isOutOfStory: false,
    ...overrides,
  };
}

function roll(text: string, outcome: DiceRollDetail['outcome'], overrides: Partial<ChatLogLine> = {}): ChatLogLine {
  return line({
    name: '<BCDice：アリア>',
    text,
    isDicebot: true,
    rollDetail: { system: 'DiceBot', faces: [], outcome },
    ...overrides,
  });
}

function tab(name: string, lines: ChatLogLine[], isSystemTab = false): ChatLogTab {
  return { name, chatMessages: lines, isSystemTab };
}

describe('renderRichChatLog', () => {
  it('writes a whole document dressed in the chosen theme', () => {
    const html = renderRichChatLog('neon', 'tab', [tab('メイン', [line()])]);

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('data-style="neon"');
    expect(html).toContain(CHAT_LOG_THEME_CSS.neon);
    expect(html).not.toContain(CHAT_LOG_THEME_CSS.washi);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('escapes what was said and who said it', () => {
    const html = renderRichChatLog('washi', 'tab', [
      tab('メイン', [line({ name: '<b>悪役</b>', text: '<script>alert(1)</script>' })]),
    ]);

    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;悪役&lt;/b&gt;');
  });

  it('keeps a line break the speaker put in', () => {
    const html = renderRichChatLog('parchment', 'tab', [tab('メイン', [line({ text: '一行目\n二行目' })])]);
    expect(html).toContain('一行目<br>二行目');
  });

  it('names the room and the tab in the heading and the title', () => {
    const html = renderRichChatLog('eerie', 'tab', [tab('探索', [line()])], { roomName: '霧の館' });

    expect(html).toContain('<p class="kicker">霧の館</p>');
    expect(html).toContain('<h1 class="title">探索</h1>');
    expect(html).toContain('<title>探索 — 霧の館</title>');
  });

  it('counts what was said, leaving the notices out', () => {
    const html = renderRichChatLog('messenger', 'tab', [
      tab('メイン', [line(), line({ text: '入室しました', isSystemMessage: true }), roll('(2D6) → 7', '')]),
    ]);
    expect(html).toContain('2 件の発言');
  });

  it('lists who spoke once each, in the order they first spoke', () => {
    const html = renderRichChatLog('messenger', 'tab', [
      tab('メイン', [
        line({ name: 'GM', messColor: '#333333' }),
        line({ name: 'アリア' }),
        line({ name: 'GM', messColor: '#333333' }),
        roll('(2D6) → 7', ''),
      ]),
    ]);
    const cast = /<ul class="cast">(.*?)<\/ul>/.exec(html)?.[1] ?? '';

    expect(cast).toBe('<li style="--c:#333333">GM</li><li style="--c:#aa3333">アリア</li>');
  });

  it('spans the time the log covers', () => {
    const html = renderRichChatLog('neon', 'tab', [tab('メイン', [line(), line({ timestamp: BASE + 95 * MINUTE })])]);
    expect(html).toContain('2026/09/11 20:00 – 21:35');
  });

  it('puts a divider where the day changes', () => {
    const html = renderRichChatLog('washi', 'tab', [
      tab('メイン', [line(), line({ name: 'GM', timestamp: BASE + 5 * 60 * MINUTE })]),
    ]);

    expect(html).toContain('<div class="day"><span>2026/09/11</span></div>');
    expect(html).toContain('<div class="day"><span>2026/09/12</span></div>');
  });

  it('folds a second line from the same speaker under the first', () => {
    const html = renderRichChatLog('messenger', 'tab', [
      tab('メイン', [line({ text: '一つ目' }), line({ text: '二つ目', timestamp: BASE + MINUTE })]),
    ]);

    expect(html).toContain('<article class="msg" ');
    expect(html).toContain('<article class="msg cont" ');
  });

  it('does not fold a line said after a long pause', () => {
    const html = renderRichChatLog('messenger', 'tab', [
      tab('メイン', [line({ text: '一つ目' }), line({ text: '二つ目', timestamp: BASE + 30 * MINUTE })]),
    ]);
    expect(html).not.toContain('msg cont');
  });

  it('does not fold a line after a roll', () => {
    const html = renderRichChatLog('messenger', 'tab', [
      tab('メイン', [line(), roll('(2D6) → 7', ''), line({ timestamp: BASE + MINUTE })]),
    ]);
    expect(html).not.toContain('msg cont');
  });

  it('draws a roll as a card with its outcome', () => {
    const html = renderRichChatLog('parchment', 'tab', [
      tab('メイン', [roll('(1D100<=70) → 3 → 決定的成功', 'critical')]),
    ]);

    expect(html).toContain('<article class="msg roll crit"');
    expect(html).toContain('<span class="oc">クリティカル</span>');
  });

  it('names the one who rolled rather than the dice bot', () => {
    const html = renderRichChatLog('parchment', 'tab', [tab('メイン', [roll('(2D6) → 7', '')])]);

    expect(html).toContain('<span class="nm">アリア</span>');
    expect(html).not.toContain('BCDice');
  });

  it('picks out the final result of a roll', () => {
    const html = renderRichChatLog('neon', 'tab', [tab('メイン', [roll('(2D6) → 5[2,3] → 5', 'success')])]);
    expect(html).toContain('(2D6) → 5[2,3] → <strong class="res">5</strong>');
  });

  it('picks out only the step the chain ends on when it runs over several lines', () => {
    const html = renderRichChatLog('neon', 'tab', [
      tab('メイン', [roll('(2D6+3) → 5[2,3]+3\n→ 8\n→ 成功', 'success')]),
    ]);

    expect(html).toContain('(2D6+3) → 5[2,3]+3<br>→ 8<br>→ <strong class="res">成功</strong>');
    expect(html.match(/class="res"/g)).toHaveLength(1);
  });

  it('seals a secret roll from anybody but its sender', () => {
    const secret = roll('(1D100) → 42', 'failure', { isSecret: true, isSendFromSelf: false });
    const html = renderRichChatLog('eerie', 'tab', [tab('メイン', [secret])]);

    expect(html).not.toContain('(1D100)');
    expect(html).not.toContain('class="oc"');
    expect(html).toContain('<span class="seal">シークレットダイス</span>');
  });

  it('shows a secret roll to its sender', () => {
    const secret = roll('(1D100) → 42', 'failure', { isSecret: true, isSendFromSelf: true });
    const html = renderRichChatLog('eerie', 'tab', [tab('メイン', [secret])]);

    expect(html).toContain('<strong class="res">42</strong>');
    expect(html).toContain('<span class="oc">失敗</span>');
  });

  it('draws a notice apart from the conversation', () => {
    const html = renderRichChatLog('washi', 'tab', [
      tab('メイン', [line({ text: '開始します', isSystemMessage: true })]),
    ]);
    expect(html).toContain('<div class="sys" data-t="0"><span>開始します</span></div>');
  });

  it('dims a line said out of the story', () => {
    const html = renderRichChatLog('washi', 'tab', [tab('メイン', [line({ isOutOfStory: true })])]);
    expect(html).toContain('<article class="msg ooc"');
  });

  it('marks a line that was edited', () => {
    const html = renderRichChatLog('washi', 'tab', [tab('メイン', [line({ fixd: true })])]);
    expect(html).toContain('<span class="ed">編集済</span>');
  });

  it('keeps a colour it cannot trust out of the style attribute', () => {
    const html = renderRichChatLog('neon', 'tab', [
      tab('メイン', [line({ messColor: 'red;background:url(https://example.com/x)' })]),
    ]);

    expect(html).not.toContain('example.com');
    expect(html).toContain('--c:#666666');
  });

  it('draws the first letter of the name where there is no portrait', () => {
    const html = renderRichChatLog('neon', 'tab', [tab('メイン', [line({ name: 'ノア' })])]);
    expect(html).toContain('<span class="ini">ノ</span>');
  });

  it('hands a portrait and an attached picture the key the registry fills in', () => {
    const portrait = { identifier: 'p1', url: 'blob:p1', name: 'p.png' } as unknown as ImageFile;
    const picture = { identifier: 'a1', url: 'blob:a1', name: '地図.png' } as unknown as ImageFile;
    const keys: Record<string, string> = { p1: 'i0', a1: 'i1' };
    const html = renderRichChatLog(
      'parchment',
      'tab',
      [tab('メイン', [line({ image: portrait, attachmentImages: [picture] })])],
      {
        imageSrcResolver: (image) => keys[image.identifier],
      }
    );

    expect(html).toContain('<img data-img-key="i0" alt="">');
    expect(html).toContain('<div class="att"><img data-img-key="i1" alt="地図.png"></div>');
  });

  it('puts the line replied to in front of the reply', () => {
    const original = line({ name: 'GM', text: '扉の向こうから物音がする' });
    const html = renderRichChatLog('messenger', 'tab', [
      tab('メイン', [line({ replyTo: 'x', replyToMessage: original as never })]),
    ]);
    expect(html).toContain(
      '<div class="ref"><span class="rn">↩ GM</span><span class="rt">扉の向こうから物音がする</span></div>'
    );
  });

  it('runs the name and the body through the decoder', () => {
    const html = renderRichChatLog('messenger', 'tab', [tab('メイン', [line({ name: '@n', text: '@t' })])], {
      textDecoder: (text) => (text === '@n' ? 'システム' : text === '@t' ? '訳文' : text),
    });

    expect(html).toContain('<span class="nm">システム</span>');
    expect(html).toContain('訳文');
  });

  it('uses the labels it is given', () => {
    const html = renderRichChatLog('neon', 'tab', [tab('Main', [roll('(2D6) → 12', 'critical')])], {
      labels: { critical: 'Critical', messages: (count) => `${count} lines` },
      lang: 'en',
    });

    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<span class="oc">Critical</span>');
    expect(html).toContain('1 lines');
  });

  describe('every tab at once', () => {
    const first = tab('メイン', [
      line({ text: '1番目', timestamp: BASE }),
      line({ text: '3番目', timestamp: BASE + 2 * MINUTE }),
    ]);
    const second = tab('雑談', [line({ name: 'ノア', text: '2番目', timestamp: BASE + MINUTE })]);
    const system = tab('システム', [line({ text: '入室しました', isSystemMessage: true })], true);

    it('merges the tabs in the order the lines were said', () => {
      const html = renderRichChatLog('neon', 'all', [first, second]);

      expect(html.indexOf('1番目')).toBeLessThan(html.indexOf('2番目'));
      expect(html.indexOf('2番目')).toBeLessThan(html.indexOf('3番目'));
    });

    it('titles itself for every tab', () => {
      const html = renderRichChatLog('neon', 'all', [first, second]);
      expect(html).toContain('<h1 class="title">全タブ</h1>');
    });

    it('leaves the system tab out', () => {
      const html = renderRichChatLog('neon', 'all', [first, system]);
      expect(html).not.toContain('入室しました');
    });

    it('marks each line with its tab and offers a filter by tab', () => {
      const html = renderRichChatLog('neon', 'all', [first, second]);

      expect(html).toContain('<span class="tg">雑談</span>');
      expect(html).toContain('data-t="1"');
      expect(html).toContain('<button type="button" data-tab="*" aria-pressed="true">すべて</button>');
      expect(html).toContain('<button type="button" data-tab="1" aria-pressed="false">雑談</button>');
      expect(html).toContain('<script>');
    });

    it('offers no filter when only one tab goes in', () => {
      const html = renderRichChatLog('neon', 'all', [first]);

      expect(html).not.toContain('class="tabs"');
      expect(html).not.toContain('class="tg"');
      expect(html).not.toContain('<script>');
    });
  });

  it('writes an empty log for a tab that holds nothing', () => {
    const html = renderRichChatLog('washi', 'tab', [tab('空', [])]);

    expect(html).toContain('<h1 class="title">空</h1>');
    expect(html).toContain('0 件の発言');
    expect(html).not.toContain('<article');
  });
});

describe('exportChatLog', () => {
  const tabs = [tab('メイン', [line({ text: '開始' })])];

  it('writes the older plain layout for the standard style', () => {
    expect(exportChatLog('standard', 'tab', tabs)).toBe(ChatLogExporter.exportTabHtml(tabs[0]));
    expect(exportChatLog('standard', 'all', tabs, { showTime: true })).toBe(
      ChatLogExporter.exportAllTabsHtml(tabs, true)
    );
  });

  it('writes the other older layout for its style', () => {
    expect(exportChatLog('coc', 'tab', tabs)).toBe(ChatLogExporter.exportTabHtmlCoc(tabs[0]));
    expect(exportChatLog('coc', 'all', tabs)).toBe(ChatLogExporter.exportAllTabsHtmlCoc(tabs));
  });

  it('dresses the log in a theme for any other style', () => {
    expect(exportChatLog('washi', 'tab', tabs)).toBe(renderRichChatLog('washi', 'tab', tabs));
  });

  it('writes an empty log rather than failing when there is no tab', () => {
    expect(() => exportChatLog('standard', 'tab', [])).not.toThrow();
  });
});
