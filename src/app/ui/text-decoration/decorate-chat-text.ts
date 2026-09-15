/* Text decoration shared by the chat and the shared notes.
   生のテキスト文字列を受け取り、HTML エスケープ → ルビ → 引用ブロック装飾を順に適用した HTML を返す。
   ChatMessageComponent (live chat) と TextNoteComponent (非編集モード) が同じ見た目で描画するために使う。 */

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  "'": '&#x27;',
  '`': '&#x60;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
};

/**
 * Escapes the characters that could start markup or break an attribute, so text can be put
 * into HTML as it was typed. A value that is not a string is converted without escaping.
 */
export function escapeHtml(text: unknown): string {
  if (typeof text !== 'string') return String(text);
  return text.replace(/[&'`"<>]/g, (match) => HTML_ESCAPE_MAP[match] ?? match);
}

const RUBY_NOTATION = /[|｜]([^|｜\s]+?)《(.+?)》/g;

const ESCAPED_SPACE = /\\s/g;

/**
 * Turns the ruby notation (`|word《reading》`, with a half- or full-width bar) into `<ruby>`
 * markup, and `\s` into a space.
 *
 * Expects text that has already been escaped.
 */
export function applyRubyMarkup(escapedHtml: string): string {
  return escapedHtml
    .replace(RUBY_NOTATION, '<ruby class="chat-ruby"><rb>$1</rb><rt>$2</rt></ruby>')
    .replace(ESCAPED_SPACE, ' ');
}

/** A run of a line: plain text, or text with a reading written over it. */
export interface RubyPart {
  readonly text: string;
  /** Empty for plain text. */
  readonly reading: string;
}

/**
 * Cuts a line at the ruby notation (`|word《reading》`), the same way {@link applyRubyMarkup} reads it.
 *
 * The runs stay text rather than becoming html, for a place that shows a line a little at a time
 * and so cannot hand over a finished piece of markup.
 */
export function splitRubyNotation(text: string): RubyPart[] {
  const parts: RubyPart[] = [];
  const plain = (from: number, to: number) => {
    if (to > from) parts.push({ text: text.slice(from, to).replace(ESCAPED_SPACE, ' '), reading: '' });
  };
  let at = 0;
  for (const match of text.matchAll(RUBY_NOTATION)) {
    plain(at, match.index);
    parts.push({ text: match[1].replace(ESCAPED_SPACE, ' '), reading: match[2].replace(ESCAPED_SPACE, ' ') });
    at = match.index + match[0].length;
  }
  plain(at, text.length);
  return parts;
}

/**
 * Gathers each run of lines starting with `>` into one quote block, the lines joined by breaks.
 *
 * Expects escaped HTML, so it looks for the escaped `&gt;`.
 */
export function decorateQuoteLines(html: string): string {
  const lines = html.split('\n');
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const match = /^&gt;\s?(.*)$/.exec(lines[i]);
    if (match) {
      const buffer: string[] = [match[1]];
      i++;
      while (i < lines.length) {
        const inner = /^&gt;\s?(.*)$/.exec(lines[i]);
        if (!inner) break;
        buffer.push(inner[1]);
        i++;
      }
      parts.push(`<span class="chat-quote">${buffer.join('<br>')}</span>`);
    } else {
      parts.push(lines[i]);
      i++;
    }
  }
  return parts.join('\n');
}

/** Escapes html, then applies the ruby notation (`|word《reading》`), then quoted lines (`> ...`) */
export function decorateChatStyleText(text: string): string {
  return decorateQuoteLines(applyRubyMarkup(escapeHtml(text)));
}
