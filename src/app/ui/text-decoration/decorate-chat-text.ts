/* Text decoration shared by the chat and the shared notes.
   Takes a raw text string and returns HTML with the chat's decorations → HTML escaping → ruby → quote-block
   decoration applied in turn.
   ChatMessageComponent (live chat) and TextNoteComponent (non-editing mode) use it to draw with the same look. */

import { chatFontWanted$ } from '@axe/core/event/domain-events';
import {
  ChatDecoration,
  chatDecorationMarkup,
  chatFontsIn,
  DecoratedRun,
  decoratedRunsOf,
  leaningPiecesOf,
} from '@axe/domain/chat/chat-decoration';
import { RUBY_NOTATION, rubyRunsOf } from '@axe/domain/chat/chat-ruby-notation';

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

const ESCAPED_SPACE = /\\s/g;

const HTML_UNESCAPE_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(HTML_ESCAPE_MAP).map(([raw, escaped]) => [escaped, raw])
);

/** Turns what {@link escapeHtml} escaped back into the characters it stood for. */
function unescapeHtml(html: string): string {
  return html.replace(/&(?:amp|#x27|#x60|quot|lt|gt);/g, (match) => HTML_UNESCAPE_MAP[match] ?? match);
}

/**
 * Turns the ruby notation (`|word《reading》`, with a half- or full-width bar) into `<ruby>`
 * markup, and `\s` into a space. A reading split by bars over the letters of its word,
 * `|漢字《かん|じ》`, is written one part over each letter.
 *
 * Expects text that has already been escaped.
 */
export function applyRubyMarkup(escapedHtml: string): string {
  return escapedHtml
    .replace(RUBY_NOTATION, (_, base: string, reading: string) => {
      const runs = rubyRunsOf(unescapeHtml(base), unescapeHtml(reading))
        .map((run) => `<rb>${escapeHtml(run.base)}</rb><rt>${escapeHtml(run.reading)}</rt>`)
        .join('');
      return `<ruby class="chat-ruby">${runs}</ruby>`;
    })
    .replace(ESCAPED_SPACE, ' ');
}

/** A run of a line: plain text, or text with a reading written over it, and what it is drawn with. */
export interface RubyPart {
  readonly text: string;
  /** Empty for plain text. */
  readonly reading: string;
  /** The chat's decorations on the run, null for a plain one. */
  readonly decoration: ChatDecoration | null;
}

/**
 * Cuts a line at the chat's decorations and then at the ruby notation (`|word《reading》`), the same
 * way {@link decorateChatStyleText} reads them, a reading split over the letters of its word into one
 * run for each letter.
 *
 * The runs stay text rather than becoming html, for a place that shows a line a little at a time
 * and so cannot hand over a finished piece of markup.
 */
export function splitRubyNotation(text: string): RubyPart[] {
  const runs = decoratedRunsOf(text);
  askForFonts(runs);
  return runs.flatMap((run) => rubyPartsOf(run.text, run.decoration));
}

function rubyPartsOf(text: string, decoration: ChatDecoration | null): RubyPart[] {
  const parts: RubyPart[] = [];
  const plain = (from: number, to: number) => {
    if (to <= from) return;
    const piece = text.slice(from, to).replace(ESCAPED_SPACE, ' ');
    if (!decoration?.italic) {
      parts.push({ text: piece, reading: '', decoration });
      return;
    }
    for (const leaning of leaningPiecesOf(piece)) {
      const upright = /^\s+$/u.test(leaning);
      parts.push({ text: leaning, reading: '', decoration: upright ? { ...decoration, italic: false } : decoration });
    }
  };
  let at = 0;
  for (const match of text.matchAll(RUBY_NOTATION)) {
    plain(at, match.index);
    for (const run of rubyRunsOf(match[1], match[2])) {
      parts.push({
        text: run.base.replace(ESCAPED_SPACE, ' '),
        reading: run.reading.replace(ESCAPED_SPACE, ' '),
        decoration,
      });
    }
    at = match.index + match[0].length;
  }
  plain(at, text.length);
  return parts;
}

/** Asks for the fonts a line is drawn in, so that they are loaded by the time it is seen. */
function askForFonts(runs: readonly DecoratedRun[]): void {
  for (const font of chatFontsIn(runs)) chatFontWanted$.emit(font);
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

/**
 * Applies the chat's decorations (`**bold**`, `[明朝]…[/]`), escaping html and applying the ruby
 * notation (`|word《reading》`) in each piece they leave, then quoted lines (`> ...`).
 */
export function decorateChatStyleText(text: string): string {
  const runs = decoratedRunsOf(text);
  askForFonts(runs);
  return decorateQuoteLines(
    chatDecorationMarkup(runs, (piece) => applyRubyMarkup(escapeHtml(piece)), leaningPiecesKeepingNotation)
  );
}

const KEPT_WHOLE = new RegExp(`${RUBY_NOTATION.source}|\\\\s`, 'g');

/** The pieces a leaning run breaks between, with a word and its reading, and a `\s`, each kept whole. */
function leaningPiecesKeepingNotation(text: string): string[] {
  const pieces: string[] = [];
  let at = 0;
  for (const match of text.matchAll(KEPT_WHOLE)) {
    pieces.push(...leaningPiecesOf(text.slice(at, match.index)), match[0]);
    at = match.index + match[0].length;
  }
  pieces.push(...leaningPiecesOf(text.slice(at)));
  return pieces;
}
