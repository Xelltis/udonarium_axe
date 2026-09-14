import type { ImageFile } from '@axe/core/storage/image-file';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import { vnBodyOf } from '@axe/domain/visual-novel/vn-emote';

export type ChatLogLine = Pick<
  ChatMessage,
  | 'name'
  | 'text'
  | 'messColor'
  | 'timestamp'
  | 'placedAt'
  | 'from'
  | 'to'
  | 'fixd'
  | 'isSecret'
  | 'isSendFromSelf'
  | 'isDisplayable'
  | 'isSentBy'
  | 'image'
  | 'attachmentImages'
  | 'quoteOf'
  | 'quoteOfMessage'
  | 'replyTo'
  | 'replyToMessage'
  | 'vnEmote'
  | 'isSystemMessage'
  | 'isDicebot'
  | 'rollDetail'
  | 'isOutOfStory'
>;

export interface ChatLogTab {
  readonly name: string;
  readonly chatMessages: readonly ChatLogLine[];
  readonly isSystemTab?: boolean;
}

export interface ChatLogEntry {
  readonly tab: ChatLogTab;
  readonly tabIndex: number;
  readonly message: ChatLogLine;
}

export type ChatLogImageSrcResolver = (image: ImageFile) => string;
/** @deprecated Use {@link ChatLogImageSrcResolver}. Kept as alias for backward compatibility. */
/**
 * A hook that converts the raw name and body before they are escaped.
 * It is mainly for expanding a translation placeholder into the translated string.
 * Without one the text passes through.
 */
export type ChatLogTextDecoder = (text: string) => string;

type MessageFormatter = (tabName: string, message: ChatLogLine) => string;

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  "'": '&#x27;',
  '`': '&#x60;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
};

export class ChatLogExporter {
  static readonly STYLE_BLOCK =
    '<style>' +
    '.m{display:flex;align-items:flex-start;margin:2px 0;line-height:1.5}' +
    '.tb{flex:0 0 auto;color:#888;font-size:.85em;margin-right:4px;padding-top:11px}' +
    '.tm{flex:0 0 auto;width:48px;color:#888;font-size:.85em;padding-top:11px}' +
    '.tc{flex:0 0 auto;margin-right:4px;padding-top:11px}' +
    '.av{display:inline-block;width:40px;height:40px;vertical-align:middle;margin-right:6px}' +
    '.ap{border:1px solid #ccc;border-radius:4px;background:#fff;object-fit:cover;object-position:50% 0}' +
    '.ct{flex:1 1 auto;min-width:0}' +
    '.bq{margin:0 4px 0 0;padding:2px 8px;border-left:3px solid #aaa;color:#666;font-size:.9em;background:#f7f7f7;display:inline-block;max-width:70%;vertical-align:middle}' +
    '.bn{font-weight:bold;margin-right:4px}' +
    '.ai{max-width:180px;max-height:120px;width:auto;height:auto;object-fit:contain;border:1px solid #ccc;border-radius:4px;background:#fff;vertical-align:top;margin:2px 4px 2px 0}' +
    '.aw{display:block;margin-top:6px;white-space:normal}' +
    '</style>\n';
  /**
   * Escapes a value for html and turns ruby markup, `|base《reading》`, into `<ruby>` tags.
   *
   * Every whitespace character, line breaks included, becomes a plain space. A value that is not a
   * string is turned into text as it is, without escaping.
   */
  static escapeHtml(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value);
    }
    const escaped = value.replace(/[&'`"<>]/g, (match) => HTML_ESCAPE_MAP[match] ?? match);
    return escaped.replace(/[|｜]([^|｜\s]+?)《(.+?)》/g, '<ruby>$1<rt>$2</rt></ruby>').replace(/\s/g, ' ');
  }

  /**
   * Escapes the text of a message as `escapeHtml` does, one line at a time, and joins the lines
   * with `<br>` so the breaks a person typed survive the escaping.
   */
  static escapeHtmlLines(value: string): string {
    return value
      .split(/\r?\n/)
      .map((line) => ChatLogExporter.escapeHtml(line))
      .join('<br>');
  }

  /**
   * One line in the standard log layout: the tab name and the time when asked for, the portrait,
   * any quoted or replied-to line, then the name and text in the speaker's colour.
   *
   * A secret roll the reader did not make shows as `（シークレットダイス）`, and an edited line is marked
   * `(編集済)`. `userId` is the reader; without it, the local user.
   */
  static formatMessageStandard(
    isTime: boolean,
    tabName: string,
    message: ChatLogLine,
    userId?: string,
    imageSrcResolver?: ChatLogImageSrcResolver,
    textDecoder?: ChatLogTextDecoder
  ): string {
    if (!message) return '';
    let str = '<div class="m">';

    if (tabName) {
      str += `<span class="tb">[${ChatLogExporter.escapeHtml(tabName)}]</span>`;
    }

    if (isTime) {
      const date = new Date(message.timestamp);
      const time = `${('00' + date.getHours()).slice(-2)}:${('00' + date.getMinutes()).slice(-2)}`;
      str += `<span class="tm">${time}</span>`;
    }

    str += ChatLogExporter.formatPortraitImage(message, imageSrcResolver);

    str += '<div class="ct">';
    str += ChatLogExporter.formatReferenceBlock(message, textDecoder);
    str += "<font color='";
    if (message.messColor) str += message.messColor.toLowerCase();
    str += "'>";

    const decodedName = ChatLogExporter.decode(message.name, textDecoder);
    str += '<b>';
    if (decodedName) str += ChatLogExporter.escapeHtml(decodedName);
    str += '</b>';

    const canSee = ChatLogExporter.canSee(message, userId);
    str += '：';
    if (!message.isSecret || canSee) {
      const decodedText = vnBodyOf(message.vnEmote, ChatLogExporter.decode(message.text, textDecoder));
      if (decodedText) str += ChatLogExporter.escapeHtmlLines(decodedText);
      str += ChatLogExporter.formatAttachmentImages(message, imageSrcResolver);
    } else {
      str += '（シークレットダイス）';
    }
    if (message.fixd) str += ' (編集済)';
    str += '</font>';
    str += '</div></div>\n';
    return str;
  }

  /**
   * One line in the classic layout other log tools can read: the tab name, the portrait, any quoted
   * or replied-to line, then the name and text in the speaker's colour.
   *
   * Secret rolls and edits are marked as in the standard layout, and arrows in the text are written
   * as `＞`.
   */
  static formatMessageCoc(
    tabName: string,
    message: ChatLogLine,
    userId?: string,
    imageSrcResolver?: ChatLogImageSrcResolver,
    textDecoder?: ChatLogTextDecoder
  ): string {
    if (!message) return '';
    let str = '';
    str += `    <div class="m" style="color:${message.messColor.toLowerCase()}">\n`;
    str += `      <span class="tc"> [${tabName}]</span>\n`;
    str += `      ${ChatLogExporter.formatPortraitImage(message, imageSrcResolver)}\n`;
    str += '      <div class="ct">\n';
    str += '        ';
    const refBlock = ChatLogExporter.formatReferenceBlock(message, textDecoder);
    if (refBlock) str += refBlock;
    const decodedName = ChatLogExporter.decode(message.name, textDecoder);
    str += `<span>${ChatLogExporter.escapeHtml(decodedName).replace('<', '').replace('>', '')}</span> `;

    const canSee = ChatLogExporter.canSee(message, userId);
    if (!message.isSecret || canSee) {
      const decodedText = vnBodyOf(message.vnEmote, ChatLogExporter.decode(message.text, textDecoder));
      if (decodedText) str += ChatLogExporter.escapeHtmlLines(decodedText).replace(/→/g, '＞');
      str += ChatLogExporter.formatAttachmentImages(message, imageSrcResolver);
    } else {
      str += '（シークレットダイス）';
    }
    if (message.fixd) str += ' (編集済)';
    str += '\n';

    str += '      </div>\n';
    str += '    </div>\n';
    str += '    \n';
    return str;
  }

  /**
   * Passes text through the decoder, such as the one expanding translation placeholders, or leaves
   * it as it is without one. Null and undefined become empty.
   */
  static decode(text: string | null | undefined, textDecoder?: ChatLogTextDecoder): string {
    if (text == null) return '';
    return textDecoder ? textDecoder(text) : text;
  }

  /**
   * Whether the reader may see what a secret line holds, which is so when they sent it. Without
   * `userId` the reader is the local user.
   */
  static canSee(message: ChatLogLine, userId?: string): boolean {
    return userId != null ? message.isSentBy(userId) : message.isSendFromSelf;
  }

  /**
   * A whole page in the standard layout for one tab, with times, holding only the lines the reader
   * may see.
   */
  static exportTabHtml(
    tab: ChatLogTab,
    userId?: string,
    imageSrcResolver?: ChatLogImageSrcResolver,
    textDecoder?: ChatLogTextDecoder
  ): string {
    const head = `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE html PUBLIC '-//W3C//DTD XHTML 1.0 Transitional//EN' 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd'>
<html xmlns='http://www.w3.org/1999/xhtml' lang='ja'>
  <head>
    <meta http-equiv='Content-Type' content='text/html; charset=UTF-8' />
    <title>チャットログ：${ChatLogExporter.escapeHtml(tab.name)}</title>
    ${ChatLogExporter.STYLE_BLOCK}  </head>
  <body>
`;
    const parts: string[] = [];
    for (const mess of tab.chatMessages) {
      if (!ChatLogExporter.isVisibleMessage(mess, userId)) continue;
      parts.push(ChatLogExporter.formatMessageStandard(true, '', mess, userId, imageSrcResolver, textDecoder));
    }
    return head + parts.join('') + '\n  </body>\n</html>';
  }

  /** A whole page in the classic layout for one tab, holding only the lines the reader may see. */
  static exportTabHtmlCoc(
    tab: ChatLogTab,
    userId?: string,
    imageSrcResolver?: ChatLogImageSrcResolver,
    textDecoder?: ChatLogTextDecoder
  ): string {
    const head = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <title>Udonalium Axe - logs</title>
    ${ChatLogExporter.STYLE_BLOCK}  </head>
  <body>

`;
    const parts: string[] = [];
    for (const mess of tab.chatMessages) {
      if (!ChatLogExporter.isVisibleMessage(mess, userId)) continue;
      parts.push(
        ChatLogExporter.formatMessageCoc(
          ChatLogExporter.escapeHtml(tab.name),
          mess,
          userId,
          imageSrcResolver,
          textDecoder
        )
      );
    }
    return head + parts.join('') + '  </body>\n</html>';
  }

  /**
   * A whole page in the standard layout merging every spoken tab in the order lines were placed,
   * each line marked with its tab. The system tab is left out, and `showTime` adds the time to each
   * line.
   */
  static exportAllTabsHtml(
    tabs: readonly ChatLogTab[],
    showTime: number | boolean,
    userId?: string,
    imageSrcResolver?: ChatLogImageSrcResolver,
    textDecoder?: ChatLogTextDecoder
  ): string {
    const head = `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE html PUBLIC '-//W3C//DTD XHTML 1.0 Transitional//EN' 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd'>
<html xmlns='http://www.w3.org/1999/xhtml' lang='ja'>
  <head>
    <meta http-equiv='Content-Type' content='text/html; charset=UTF-8' />
    <title>チャットログ：全タブ</title>
    ${ChatLogExporter.STYLE_BLOCK}  </head>
  <body>
`;
    const main = ChatLogExporter.mergeTabMessages(
      ChatLogExporter.spokenTabs(tabs),
      (tabName, message) =>
        ChatLogExporter.formatMessageStandard(!!showTime, tabName, message, userId, imageSrcResolver, textDecoder),
      userId
    );
    return head + main + '\n  </body>\n</html>';
  }

  /**
   * A whole page in the classic layout merging every spoken tab in the order lines were placed,
   * each line marked with its tab. The system tab is left out.
   */
  static exportAllTabsHtmlCoc(
    tabs: readonly ChatLogTab[],
    userId?: string,
    imageSrcResolver?: ChatLogImageSrcResolver,
    textDecoder?: ChatLogTextDecoder
  ): string {
    const head = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <title>Udonalium Axe - logs</title>
    ${ChatLogExporter.STYLE_BLOCK}  </head>
  <body>

`;
    const main = ChatLogExporter.mergeTabMessages(
      ChatLogExporter.spokenTabs(tabs),
      (tabName, message) => ChatLogExporter.formatMessageCoc(tabName, message, userId, imageSrcResolver, textDecoder),
      userId
    );
    return head + main + '  </body>\n</html>';
  }

  /**
   * The tabs that go into an export of them all.
   *
   * The system tab fills with arrivals and departures, and mixed in they sink the exchanges worth rereading.
   * A single-tab export can choose it, so it is there when it is wanted.
   */
  static spokenTabs(tabs: readonly ChatLogTab[]): readonly ChatLogTab[] {
    return tabs.filter((tab) => !tab.isSystemTab);
  }

  /**
   * Whether a line belongs in the reader's log: anything said to everyone, or a direct line the
   * reader sent or was sent. Without `userId` the reader is the local user.
   */
  static isVisibleMessage(message: ChatLogLine, userId?: string): boolean {
    const to = message.to;
    if (!to) return true;
    if (userId != null) {
      return to === userId || message.from === userId;
    }
    return message.isDisplayable;
  }

  /**
   * Interleaves the lines of several tabs into one list in the order they were placed, each keeping
   * its tab.
   *
   * Each tab is taken to be in placed order already, and lines the reader may not see are dropped.
   */
  static mergeEntries(tabs: readonly ChatLogTab[], userId?: string): ChatLogEntry[] {
    if (!tabs || tabs.length === 0) return [];
    const tabNum = tabs.length;
    const indexList = new Array<number>(tabNum).fill(0);
    const entries: ChatLogEntry[] = [];

    while (true) {
      let fastTabIndex = -1;
      let earliestPlacedAt = -1;

      for (let i = 0; i < tabNum; i++) {
        if (tabs[i].chatMessages.length <= indexList[i]) continue;
        const placedAt = tabs[i].chatMessages[indexList[i]].placedAt;
        if (earliestPlacedAt === -1 || placedAt < earliestPlacedAt) {
          earliestPlacedAt = placedAt;
          fastTabIndex = i;
        }
      }
      if (fastTabIndex === -1) break;

      const message = tabs[fastTabIndex].chatMessages[indexList[fastTabIndex]];
      if (ChatLogExporter.isVisibleMessage(message, userId)) {
        entries.push({ tab: tabs[fastTabIndex], tabIndex: fastTabIndex, message });
      }
      indexList[fastTabIndex]++;
    }
    return entries;
  }

  private static mergeTabMessages(tabs: readonly ChatLogTab[], formatter: MessageFormatter, userId?: string): string {
    return ChatLogExporter.mergeEntries(tabs, userId)
      .map((entry) => formatter(entry.tab.name, entry.message))
      .join('');
  }

  private static formatPortraitImage(message: ChatLogLine, imageSrcResolver?: ChatLogImageSrcResolver): string {
    const portrait = message.image;
    const key = portrait ? (imageSrcResolver?.(portrait) ?? portrait.url) : '';
    if (!portrait || !key) {
      return '<span class="av"></span>';
    }
    const alt = message.name || 'portrait';
    return `<img data-img-key="${ChatLogExporter.escapeAttribute(key)}" alt="${ChatLogExporter.escapeAttribute(alt)}" class="av ap" />`;
  }

  // The message quoted or replied to is put in front of the body as a small quotation,
  // trimmed to about the length the chat itself previews.
  private static formatReferenceBlock(message: ChatLogLine, textDecoder?: ChatLogTextDecoder): string {
    const quote = message.quoteOf ? message.quoteOfMessage : null;
    const reply = message.replyTo ? message.replyToMessage : null;
    if (!quote && !reply) return '';

    const blocks: string[] = [];
    if (quote) {
      blocks.push(
        ChatLogExporter.formatReferenceBlockBody({
          label: '引用',
          icon: '❝',
          target: quote,
          maxTextLength: 280,
          textDecoder,
        })
      );
    }
    if (reply) {
      blocks.push(
        ChatLogExporter.formatReferenceBlockBody({
          label: '返信先',
          icon: '↩',
          target: reply,
          maxTextLength: 120,
          textDecoder,
        })
      );
    }
    return blocks.join('');
  }

  /**
   * The text of a quoted or replied-to line folded onto one line and cut to `maxTextLength`
   * characters with an ellipsis, without the staging an older novel-mode line carries.
   */
  static referenceExcerpt(target: ChatLogLine, maxTextLength: number, textDecoder?: ChatLogTextDecoder): string {
    const rawText = vnBodyOf(target.vnEmote, ChatLogExporter.decode(target.text, textDecoder))
      .replace(/\s+/g, ' ')
      .trim();
    return rawText.length > maxTextLength ? rawText.slice(0, maxTextLength) + '…' : rawText;
  }

  private static formatReferenceBlockBody(opts: {
    label: string;
    icon: string;
    target: ChatLogLine;
    maxTextLength: number;
    textDecoder?: ChatLogTextDecoder;
  }): string {
    const { label, icon, target, maxTextLength, textDecoder } = opts;
    const rawName = ChatLogExporter.decode(target.name, textDecoder);
    const truncated = ChatLogExporter.referenceExcerpt(target, maxTextLength, textDecoder);
    const name = ChatLogExporter.escapeHtml(rawName || label);
    const text = ChatLogExporter.escapeHtml(truncated);
    // It is drawn as a pale block with a rule down its left, so it reads apart from the body.
    // It sits compactly after the name, with the body on the next line.
    return (
      `<blockquote class="bq">` +
      `<span class="bn">${icon} ${name}</span>` +
      `<span>${text}</span>` +
      `</blockquote><br>`
    );
  }

  private static formatAttachmentImages(message: ChatLogLine, imageSrcResolver?: ChatLogImageSrcResolver): string {
    const images = message.attachmentImages ?? [];
    if (images.length < 1) return '';

    const imageTags = images
      .map((image) => {
        const key = imageSrcResolver?.(image) ?? image.url;
        if (!key) return '';
        const alt = image.name || '添付画像';
        return `<img data-img-key="${ChatLogExporter.escapeAttribute(key)}" alt="${ChatLogExporter.escapeAttribute(alt)}" class="ai" />`;
      })
      .filter((imageTag) => imageTag.length > 0)
      .join('');

    if (!imageTags) return '';
    return `<span class="aw">${imageTags}</span>`;
  }

  /**
   * Escapes text for use inside an html attribute. Unlike `escapeHtml`, it leaves whitespace and
   * ruby markup as they are.
   */
  static escapeAttribute(value: string): string {
    return value.replace(/[&'`"<>]/g, (match) => HTML_ESCAPE_MAP[match] ?? match);
  }
}
