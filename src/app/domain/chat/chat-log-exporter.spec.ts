import { ChatLogExporter } from '@axe/domain/chat/chat-log-exporter';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import type { ChatTab } from '@axe/domain/chat/chat-tab';

function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const timestamp = overrides.timestamp ?? 1000;
  return {
    name: 'テストユーザー',
    text: 'テストメッセージ',
    messColor: '#000000',
    timestamp,
    placedAt: timestamp,
    from: 'user-1',
    to: '',
    fixd: false,
    isSecret: false,
    isSendFromSelf: true,
    isDisplayable: true,
    isSentBy: (userId: string) => overrides.from === userId || overrides.originFrom === userId,
    ...overrides,
  } as unknown as ChatMessage;
}

function createMockTab(name: string, messages: ChatMessage[]): ChatTab {
  return {
    name,
    chatMessages: messages,
  } as unknown as ChatTab;
}

describe('ChatLogExporter', () => {
  describe('STYLE_BLOCK', () => {
    it('carries every class it uses', () => {
      const block = ChatLogExporter.STYLE_BLOCK;
      expect(block).toMatch(/^<style>.+<\/style>\n$/);
      for (const cls of ['.m{', '.tb{', '.tm{', '.tc{', '.av{', '.ap{', '.ct{', '.bq{', '.bn{', '.ai{', '.aw{']) {
        expect(block).toContain(cls);
      }
    });

    it('holds a tall portrait by its top edge, so the head is not cut off', () => {
      expect(ChatLogExporter.STYLE_BLOCK).toContain('object-position:50% 0');
    });
  });

  describe('escapeHtml', () => {
    it('escapes the markup characters', () => {
      expect(ChatLogExporter.escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('escapes an ampersand', () => {
      expect(ChatLogExporter.escapeHtml('A&B')).toBe('A&amp;B');
    });

    it('escapes a single quote', () => {
      expect(ChatLogExporter.escapeHtml("it's")).toBe('it&#x27;s');
    });

    it('escapes a backtick', () => {
      expect(ChatLogExporter.escapeHtml('`code`')).toBe('&#x60;code&#x60;');
    });

    it('turns the ruby notation into ruby markup', () => {
      const result = ChatLogExporter.escapeHtml('|漢字《かんじ》');
      expect(result).toContain('<ruby>漢字<rt>かんじ</rt></ruby>');
    });

    it('reads a full-width bar in that notation too', () => {
      const result = ChatLogExporter.escapeHtml('｜熟語《じゅくご》');
      expect(result).toContain('<ruby>熟語<rt>じゅくご</rt></ruby>');
    });

    it('renders anything that is not text as text', () => {
      expect(ChatLogExporter.escapeHtml(42)).toBe('42');
      expect(ChatLogExporter.escapeHtml(null)).toBe('null');
      expect(ChatLogExporter.escapeHtml(undefined)).toBe('undefined');
    });

    it('turns a line break or a tab into a space', () => {
      const result = ChatLogExporter.escapeHtml('A\tB\nC');
      expect(result).toBe('A B C');
    });
  });

  describe('formatMessageStandard', () => {
    it('renders an ordinary message', () => {
      const msg = createMockMessage({ name: '勇者', text: 'こんにちは', messColor: '#ff0000' });
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);

      expect(result).toContain('#ff0000');
      expect(result).toContain('<b>勇者</b>');
      expect(result).toContain('こんにちは');
    });

    it('keeps the line breaks of a message as breaks', () => {
      const msg = createMockMessage({ text: '一行目\n二行目\r\n三行目' });
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);

      expect(result).toContain('一行目<br>二行目<br>三行目');
    });

    it('puts the name of the tab in front where there is one', () => {
      const msg = createMockMessage();
      const result = ChatLogExporter.formatMessageStandard(false, 'メインタブ', msg);

      expect(result).toContain('[メインタブ]');
    });

    it('writes the hour and the minute when it is asked to', () => {
      const ts = new Date(2024, 0, 1, 14, 30).getTime();
      const msg = createMockMessage({ timestamp: ts });
      const result = ChatLogExporter.formatMessageStandard(true, '', msg);

      expect(result).toContain('14:30');
    });

    it('hides a secret message from anybody but its sender', () => {
      const msg = createMockMessage({
        isSecret: true,
        isSendFromSelf: false,
        text: '秘密のメッセージ',
        from: 'other-user',
      } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);

      expect(result).not.toContain('秘密のメッセージ');
      expect(result).toContain('シークレットダイス');
    });

    it('shows it to the sender', () => {
      const msg = createMockMessage({
        isSecret: true,
        from: 'user-A',
        text: '秘密のメッセージ',
        isSentBy: (id: string) => id === 'user-A',
      } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg, 'user-A');

      expect(result).toContain('秘密のメッセージ');
    });

    it('marks a message that was edited', () => {
      const msg = createMockMessage({ fixd: true });
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);

      expect(result).toContain('(編集済)');
    });

    it('renders an attached picture as a picture', () => {
      const msg = createMockMessage({
        attachmentImages: [
          {
            identifier: 'image-1',
            name: 'stamp.png',
            url: 'blob:stamp-image',
          },
        ],
      } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(
        false,
        '',
        msg,
        undefined,
        () => 'data:image/png;base64,AAAA'
      );

      expect(result).toContain('<img');
      expect(result).toContain('data-img-key="data:image/png;base64,AAAA"');
      expect(result).toContain('alt="stamp.png"');
    });

    it('escapes it into the attributes without reading the ruby notation', () => {
      const msg = createMockMessage({
        attachmentImages: [
          {
            identifier: 'image-1',
            name: '|画像《がぞう》',
            url: 'https://example.test/stamp.png?x=1&y=2',
          },
        ],
      } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);

      expect(result).toContain('data-img-key="https://example.test/stamp.png?x=1&amp;y=2"');
      expect(result).toContain('alt="|画像《がぞう》"');
      expect(result).not.toContain('<ruby>画像');
    });

    it('renders no picture for a secret message that cannot be seen', () => {
      const msg = createMockMessage({
        isSecret: true,
        isSendFromSelf: false,
        from: 'other-user',
        attachmentImages: [
          {
            identifier: 'secret-image',
            name: 'secret.png',
            url: 'data:image/png;base64,SECRET',
          },
        ],
      } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);

      expect(result).not.toContain('<img');
      expect(result).not.toContain('secret.png');
      expect(result).toContain('シークレットダイス');
    });

    it('renders nothing for no message at all', () => {
      expect(ChatLogExporter.formatMessageStandard(false, '', null!)).toBe('');
    });

    it('gives a portrait the classes of both an avatar and a portrait', () => {
      const portrait = {
        identifier: 'portrait-square',
        name: 'hero.png',
        url: 'blob:portrait',
      };
      const msg = createMockMessage({ name: '勇者', image: portrait } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg, undefined, () => 'k1');
      expect(result).toContain('class="av ap"');
    });

    it('puts the message replied to in front of the body', () => {
      const targetMessage = {
        identifier: 'msg-target',
        name: '相手',
        text: '元の発言',
      } as ChatMessage;
      const msg = createMockMessage({
        name: '自分',
        text: '返事',
        replyTo: 'msg-target',
        replyToMessage: targetMessage,
      } as Partial<ChatMessage> & { replyToMessage: ChatMessage });
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);
      expect(result).toContain('↩');
      expect(result).toContain('相手');
      expect(result).toContain('元の発言');
      expect(result.indexOf('blockquote')).toBeLessThan(result.indexOf('<b>自分</b>'));
      expect(result.indexOf('blockquote')).toBeLessThan(result.indexOf('返事'));
    });

    it('puts the message quoted in front of it as a quotation', () => {
      const targetMessage = {
        identifier: 'msg-quote',
        name: '相手',
        text: '引用される本文',
      } as ChatMessage;
      const msg = createMockMessage({
        name: '自分',
        text: 'コメント',
        quoteOf: 'msg-quote',
        quoteOfMessage: targetMessage,
      } as Partial<ChatMessage> & { quoteOfMessage: ChatMessage });
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);
      expect(result).toContain('❝');
      expect(result).toContain('引用される本文');
    });

    it('runs the name and the body through the decoder before escaping them', () => {
      const msg = createMockMessage({
        name: '@i18n:common.chat.systemName:{}',
        text: '@i18n:common.chat.logClearedBy:{"user":"GM"}',
      });
      const decoder = (text: string) => {
        if (text === '@i18n:common.chat.systemName:{}') return 'システム';
        if (text === '@i18n:common.chat.logClearedBy:{"user":"GM"}') return 'GM がログを消去しました';
        return text;
      };
      const result = ChatLogExporter.formatMessageStandard(false, '', msg, undefined, undefined, decoder);
      expect(result).toContain('<b>システム</b>');
      expect(result).toContain('GM がログを消去しました');
      expect(result).not.toContain('@i18n:');
    });

    it('puts the portrait in front of the name', () => {
      const portrait = {
        identifier: 'portrait-1',
        name: 'hero.png',
        url: 'blob:portrait-url',
      };
      const msg = createMockMessage({ name: '勇者', image: portrait } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg, undefined, (image) =>
        image === portrait ? 'data:image/png;base64,PORTRAIT' : image.url
      );

      expect(result).toContain('data-img-key="data:image/png;base64,PORTRAIT"');
      expect(result).toContain('alt="勇者"');
      const imgPos = result.indexOf('<img');
      const namePos = result.indexOf('<b>勇者</b>');
      expect(imgPos).toBeGreaterThan(-1);
      expect(imgPos).toBeLessThan(namePos);
    });

    it('keeps the column aligned with a placeholder when there is none', () => {
      const msg = createMockMessage({ image: null } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);
      expect(result).not.toContain('<img');
      expect(result).toContain('class="av"');
    });

    it('gives the row and its contents their own classes', () => {
      const msg = createMockMessage();
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);
      expect(result).toContain('<div class="m">');
      expect(result).toContain('<div class="ct">');
    });

    it('gives the tab name its own', () => {
      const msg = createMockMessage();
      const result = ChatLogExporter.formatMessageStandard(false, 'タブ名', msg);
      expect(result).toContain('<span class="tb">');
    });

    it('gives the time its own', () => {
      const msg = createMockMessage({ timestamp: new Date(2024, 0, 1, 9, 5).getTime() });
      const result = ChatLogExporter.formatMessageStandard(true, '', msg);
      expect(result).toContain('<span class="tm">');
    });

    it('gives the quotation and its label their own', () => {
      const target = { identifier: 'q', name: '相手', text: '引用文' } as ChatMessage;
      const msg = createMockMessage({
        quoteOf: 'q',
        quoteOfMessage: target,
      } as Partial<ChatMessage> & { quoteOfMessage: ChatMessage });
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);
      expect(result).toContain('<blockquote class="bq">');
      expect(result).toContain('<span class="bn">');
    });

    it('gives the attached picture and its wrapper their own', () => {
      const msg = createMockMessage({
        attachmentImages: [{ identifier: 'img-1', name: 'test.png', url: 'blob:test' }],
      } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageStandard(false, '', msg);
      expect(result).toContain('class="ai"');
      expect(result).toContain('<span class="aw">');
    });
  });

  describe('formatMessageCoc', () => {
    it('renders a message in the other layout', () => {
      const msg = createMockMessage({ name: '探索者', text: '目星チェック', messColor: '#0000ff' });
      const result = ChatLogExporter.formatMessageCoc('メインタブ', msg);

      expect(result).toContain('color:#0000ff');
      expect(result).toContain('探索者');
      expect(result).toContain('目星チェック');
      expect(result).toContain('[メインタブ]');
    });

    it('keeps the line breaks of a message as breaks there too', () => {
      const msg = createMockMessage({ text: '一行目\n二行目' });
      const result = ChatLogExporter.formatMessageCoc('メインタブ', msg);

      expect(result).toContain('一行目<br>二行目');
    });

    it('renders an attached picture there as well', () => {
      const msg = createMockMessage({
        name: '探索者',
        text: '参考画像',
        attachmentImages: [
          {
            identifier: 'image-1',
            name: 'stamp.png',
            url: 'blob:stamp-image',
          },
        ],
      } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageCoc('メインタブ', msg, undefined, () => 'data:image/png;base64,BBBB');

      expect(result).toContain('<img');
      expect(result).toContain('data-img-key="data:image/png;base64,BBBB"');
      expect(result).toContain('alt="stamp.png"');
    });

    it('renders nothing for no message at all', () => {
      expect(ChatLogExporter.formatMessageCoc('', null!)).toBe('');
    });

    it('puts a quotation or a reply in front of the name there, apart from the body', () => {
      const targetMessage = {
        identifier: 'msg-target-coc',
        name: '相手',
        text: '元の発言',
      } as ChatMessage;
      const msg = createMockMessage({
        name: '自分',
        text: '返事',
        replyTo: 'msg-target-coc',
        replyToMessage: targetMessage,
      } as Partial<ChatMessage> & { replyToMessage: ChatMessage });
      const result = ChatLogExporter.formatMessageCoc('タブ', msg);
      expect(result.indexOf('blockquote')).toBeLessThan(result.indexOf('<span>自分</span>'));
      expect(result.indexOf('blockquote')).toBeLessThan(result.indexOf('返事'));
    });

    it('wraps the body in a division rather than a paragraph, which a quotation would close', () => {
      const msg = createMockMessage({ name: '探索者', text: '本文' });
      const result = ChatLogExporter.formatMessageCoc('タブ', msg);
      expect(result).not.toContain('<p ');
      expect(result).toContain('<div ');
    });

    it('gives the row its class and its colour', () => {
      const msg = createMockMessage({ messColor: '#FF0000' });
      const result = ChatLogExporter.formatMessageCoc('タブ', msg);
      expect(result).toContain('class="m"');
      expect(result).toContain('style="color:#ff0000"');
    });

    it('gives the tab name its own class there', () => {
      const msg = createMockMessage();
      const result = ChatLogExporter.formatMessageCoc('タブ', msg);
      expect(result).toContain('class="tc"');
    });

    it('puts the portrait in front of the name there too', () => {
      const portrait = {
        identifier: 'portrait-2',
        name: 'kp.png',
        url: 'blob:portrait-coc',
      };
      const msg = createMockMessage({ name: 'KP', image: portrait } as Partial<ChatMessage>);
      const result = ChatLogExporter.formatMessageCoc('タブ', msg, undefined, (image) =>
        image === portrait ? 'data:image/png;base64,COC' : image.url
      );

      expect(result).toContain('data-img-key="data:image/png;base64,COC"');
      const imgPos = result.indexOf('<img');
      const namePos = result.indexOf('<span>KP</span>');
      expect(imgPos).toBeGreaterThan(-1);
      expect(imgPos).toBeLessThan(namePos);
    });
  });

  describe('isVisibleMessage', () => {
    it('is always true when it is addressed to nobody', () => {
      const msg = createMockMessage({ to: '' });
      expect(ChatLogExporter.isVisibleMessage(msg)).toBe(true);
    });

    it('is true when there is no address at all', () => {
      const msg = createMockMessage({ to: null! });
      expect(ChatLogExporter.isVisibleMessage(msg)).toBe(true);
    });

    it('is true for somebody it is addressed to', () => {
      const msg = createMockMessage({ to: 'user-A', from: 'user-B' });
      expect(ChatLogExporter.isVisibleMessage(msg, 'user-A')).toBe(true);
    });

    it('is true for the sender', () => {
      const msg = createMockMessage({ to: 'user-B', from: 'user-A' });
      expect(ChatLogExporter.isVisibleMessage(msg, 'user-A')).toBe(true);
    });
  });

  describe('exportTabHtml', () => {
    it('writes the log out', () => {
      const msg = createMockMessage({ name: 'GM', text: '開始' });
      const tab = createMockTab('メイン', [msg]);
      const result = ChatLogExporter.exportTabHtml(tab);

      expect(result).toContain("<?xml version='1.0'");
      expect(result).toContain('チャットログ：メイン');
      expect(result).toContain('GM');
      expect(result).toContain('開始');
      expect(result).toContain('</html>');
    });

    it('puts the styles in the head', () => {
      const tab = createMockTab('T', [createMockMessage()]);
      const result = ChatLogExporter.exportTabHtml(tab);
      expect(result).toContain(ChatLogExporter.STYLE_BLOCK);
    });
  });

  describe('exportTabHtmlCoc', () => {
    it('writes it out in the other layout', () => {
      const msg = createMockMessage({ name: '探索者', text: 'SAN値チェック' });
      const tab = createMockTab('セッション', [msg]);
      const result = ChatLogExporter.exportTabHtmlCoc(tab);

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Udonalium Axe - logs');
      expect(result).toContain('探索者');
      expect(result).toContain('SAN値チェック');
    });

    it('puts the styles in the head', () => {
      const tab = createMockTab('T', [createMockMessage()]);
      const result = ChatLogExporter.exportTabHtmlCoc(tab);
      expect(result).toContain(ChatLogExporter.STYLE_BLOCK);
    });
  });

  describe('exportAllTabsHtml', () => {
    it('merges the messages of several tabs in order of time', () => {
      const tab1 = createMockTab('タブ1', [
        createMockMessage({ name: 'A', text: '1番目', timestamp: 100 }),
        createMockMessage({ name: 'A', text: '3番目', timestamp: 300 }),
      ]);
      const tab2 = createMockTab('タブ2', [createMockMessage({ name: 'B', text: '2番目', timestamp: 200 })]);

      const result = ChatLogExporter.exportAllTabsHtml([tab1, tab2], true);

      const pos1 = result.indexOf('1番目');
      const pos2 = result.indexOf('2番目');
      const pos3 = result.indexOf('3番目');
      expect(pos1).toBeLessThan(pos2);
      expect(pos2).toBeLessThan(pos3);
    });

    it('keeps a line opened later where its own tab holds it', () => {
      // An opened roll sits at the end of its tab under the time it was said at, so merging
      // the tabs by that time would put it back among the lines it was said between.
      const tab1 = createMockTab('タブ1', [
        createMockMessage({ name: 'A', text: '1番目', timestamp: 100 }),
        createMockMessage({ name: 'A', text: '3番目', timestamp: 50, placedAt: 300 }),
      ]);
      const tab2 = createMockTab('タブ2', [createMockMessage({ name: 'B', text: '2番目', timestamp: 200 })]);

      const result = ChatLogExporter.exportAllTabsHtml([tab1, tab2], true);

      expect(result.indexOf('1番目')).toBeLessThan(result.indexOf('2番目'));
      expect(result.indexOf('2番目')).toBeLessThan(result.indexOf('3番目'));
    });

    it('writes an empty body for no tabs at all', () => {
      const result = ChatLogExporter.exportAllTabsHtml([], false);
      expect(result).toContain('<body>');
      expect(result).toContain('</body>');
    });

    it('puts the styles in the head', () => {
      const result = ChatLogExporter.exportAllTabsHtml([], false);
      expect(result).toContain(ChatLogExporter.STYLE_BLOCK);
    });
  });

  describe('exportAllTabsHtmlCoc', () => {
    it('merges them in the other layout too', () => {
      const tab = createMockTab('セッション', [createMockMessage({ name: 'KP', text: 'テスト', timestamp: 100 })]);
      const result = ChatLogExporter.exportAllTabsHtmlCoc([tab]);

      expect(result).toContain('Udonalium Axe - logs');
      expect(result).toContain('KP');
    });

    it('puts the styles in the head', () => {
      const tab = createMockTab('T', [createMockMessage({ timestamp: 1 })]);
      const result = ChatLogExporter.exportAllTabsHtmlCoc([tab]);
      expect(result).toContain(ChatLogExporter.STYLE_BLOCK);
    });
  });
  describe('the novel-mode staging', () => {
    it('writes the body alone when the staging is kept beside the line', () => {
      const tab = createMockTab('メイン', [
        createMockMessage({ text: 'なんだって！？', vnEmote: 'shape:shout bubble:shake' } as Partial<ChatMessage>),
      ]);
      const html = ChatLogExporter.exportTabHtml(tab);
      expect(html).toContain('なんだって！？');
      expect(html).not.toContain('〔');
    });

    it('takes the staging off a line said before it was kept apart', () => {
      const tab = createMockTab('メイン', [createMockMessage({ text: 'なんだって！？ 〔叫び・ゆれ〕' })]);
      const html = ChatLogExporter.exportTabHtml(tab);
      expect(html).toContain('なんだって！？');
      expect(html).not.toContain('叫び');
    });

    it('leaves a bracket it cannot read alone', () => {
      const tab = createMockTab('メイン', [createMockMessage({ text: 'メモ 〔重要〕' })]);
      expect(ChatLogExporter.exportTabHtml(tab)).toContain('重要');
    });
  });
});
