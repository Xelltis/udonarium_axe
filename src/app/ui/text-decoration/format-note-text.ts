import { applyRubyMarkup, escapeHtml } from '@axe/ui/text-decoration/decorate-chat-text';
import { find } from 'linkifyjs';

const FENCE = /^```/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^-\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const INLINE_CODE = /`([^`\n]+)`/g;

/** Words outside code as html: escaped, with their ruby, and an address made a link. */
function prose(text: string): string {
  let html = '';
  let at = 0;
  for (const link of find(text, 'url')) {
    html += applyRubyMarkup(escapeHtml(text.slice(at, link.start)));
    html += `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.value)}</a>`;
    at = link.end;
  }
  return html + applyRubyMarkup(escapeHtml(text.slice(at)));
}

/** A line's words as html: code between backticks kept as it was typed, the rest as {@link prose}. */
function inline(line: string): string {
  let html = '';
  let at = 0;
  for (const match of line.matchAll(INLINE_CODE)) {
    html += prose(line.slice(at, match.index));
    html += `<code>${escapeHtml(match[1])}</code>`;
    at = match.index + match[0].length;
  }
  return html + prose(line.slice(at));
}

/** The lines from `start` that `pattern` takes, as far as they run, each with its words. */
function run(lines: readonly string[], start: number, pattern: RegExp): string[] {
  const taken: string[] = [];
  for (let at = start; at < lines.length; at++) {
    const match = pattern.exec(lines[at]);
    if (!match) break;
    taken.push(match[1]);
  }
  return taken;
}

/**
 * A shared note's text drawn with a little formatting, read from marks at the start of a line as a
 * note is written in plain text: `#` to `###` headings, `- ` and `1. ` lists, `> ` quotes, code
 * between backticks or in a fenced block, with ruby as in chat. A single line break stays a break and
 * a blank line starts a new paragraph.
 *
 * What is read is kept to marks at the start of a line on purpose: stars and underscores are left
 * as they are, since a sum such as `2*3` is ordinary in a game's notes. The text is escaped before
 * anything is made of it and only a fixed set of tags is put round it, so nothing written can run
 * or load anything for whoever sees the note; addresses become links, outside code.
 */
export function formatNoteText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  const closeParagraph = () => {
    if (paragraph.length > 0) blocks.push(`<p>${paragraph.join('<br>')}</p>`);
    paragraph = [];
  };

  let at = 0;
  while (at < lines.length) {
    const line = lines[at];
    if (FENCE.test(line)) {
      closeParagraph();
      const code: string[] = [];
      at++;
      while (at < lines.length && !FENCE.test(lines[at])) code.push(lines[at++]);
      at++;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      closeParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      at++;
      continue;
    }
    const listed: [RegExp, string][] = [
      [BULLET, 'ul'],
      [NUMBERED, 'ol'],
    ];
    const list = listed.find(([pattern]) => pattern.test(line));
    if (list) {
      closeParagraph();
      const items = run(lines, at, list[0]);
      blocks.push(`<${list[1]}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list[1]}>`);
      at += items.length;
      continue;
    }
    if (QUOTE.test(line)) {
      closeParagraph();
      const quoted = run(lines, at, QUOTE);
      blocks.push(`<blockquote>${quoted.map(inline).join('<br>')}</blockquote>`);
      at += quoted.length;
      continue;
    }
    if (line.trim().length === 0) {
      closeParagraph();
    } else {
      paragraph.push(inline(line));
    }
    at++;
  }
  closeParagraph();
  return blocks.join('');
}
