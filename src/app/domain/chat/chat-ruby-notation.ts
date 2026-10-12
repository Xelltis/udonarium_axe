import { toGraphemes } from '@axe/core/util/graphemes';

/**
 * The ruby notation of the chat, `|word《reading》` with a half- or full-width bar: the word as the
 * first group, the reading written over it as the second.
 *
 * It is global, for `replace` and `matchAll`, which start from the beginning of a line whatever an
 * earlier search left behind.
 */
export const RUBY_NOTATION = /[|｜]([^|｜\s]+?)《(.+?)》/g;

/** What splits a reading into one for each letter of its word: a half- or full-width bar. */
const READING_SEPARATOR = /[|｜]/;

/** A word, or one letter of it, with the reading written over it; an empty reading for none. */
export interface RubyRun {
  readonly base: string;
  readonly reading: string;
}

/**
 * The runs a word and its reading are written as.
 *
 * A reading split by bars into as many parts as the word has letters, `|漢字《かん|じ》`, is written
 * one part over each letter (mono ruby); a part left empty leaves its letter bare. Any other reading
 * is written over the whole word as one (group ruby), its bars dropped where they do not match.
 */
export function rubyRunsOf(base: string, reading: string): RubyRun[] {
  const parts = reading.split(READING_SEPARATOR);
  if (parts.length < 2) return [{ base, reading }];
  const letters = toGraphemes(base);
  if (letters.length !== parts.length) return [{ base, reading: parts.join('') }];
  return letters.map((letter, index) => ({ base: letter, reading: parts[index] }));
}

/** A reading as it is read aloud, without the bars that split it over the letters of its word. */
export function readingOf(reading: string): string {
  return reading.split(READING_SEPARATOR).join('');
}

/**
 * Writes a line with its ruby notation as `<ruby class="chat-ruby">` markup, each run of a word as a
 * base and its reading, and everything else through `escape`.
 */
export function rubyMarkupOfLine(text: string, escape: (text: string) => string): string {
  let html = '';
  let at = 0;
  for (const match of text.matchAll(RUBY_NOTATION)) {
    html += escape(text.slice(at, match.index));
    const runs = rubyRunsOf(match[1], match[2])
      .map((run) => `<rb>${escape(run.base)}</rb><rt>${escape(run.reading)}</rt>`)
      .join('');
    html += `<ruby class="chat-ruby">${runs}</ruby>`;
    at = match.index + match[0].length;
  }
  return html + escape(text.slice(at));
}
