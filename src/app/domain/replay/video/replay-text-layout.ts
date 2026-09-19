/** How wide a run of text is drawn, in the units the layout is given its width in. */
export type ReplayTextMeasure = (text: string) => number;

/** One page of a subtitle: the lines shown together, and how many characters they hold. */
export interface ReplayTextPage {
  lines: string[];
  charCount: number;
}

/** Characters a line may not start with: closing brackets, stops, small kana and the like. */
const NO_LINE_START = new Set([
  ...'、。，．・：；？！゛゜ヽヾゝゞ々ー〜～…‥」』）］｝〉》〕】〙〗’”'.split(''),
  ...'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ'.split(''),
  ...',.:;!?)]}%'.split(''),
]);

/** Characters a line may not end with: opening brackets. */
const NO_LINE_END = new Set([...'「『（［｛〈《〔【〘〖‘“'.split(''), ...'([{'.split('')]);

/** A run of letters or digits that is kept whole, as a word is: Latin, Hangul and the like. */
const WORD_CHAR = /[\p{Script=Latin}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Greek}\p{Nd}'’\-_@#&]/u;

/**
 * Lays a subtitle out in lines no wider than `maxWidth`, gathered into pages of `maxLines`.
 *
 * Japanese and Chinese may break between any two characters, kept from starting a line with a
 * closing bracket or a stop and from ending one with an opening bracket (kinsoku). Words in
 * alphabetic scripts and in Hangul are kept whole, breaking at spaces, so a mixed line breaks each
 * part its own way. A word wider than a whole line is broken where it must. Line breaks in the text
 * are kept. Nothing is cut off: text beyond one page goes on to the next.
 */
export function layoutReplayText(
  text: string,
  measure: ReplayTextMeasure,
  maxWidth: number,
  maxLines: number
): ReplayTextPage[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    lines.push(...breakParagraph(paragraph.trimEnd(), measure, maxWidth));
  }
  while (lines.length > 1 && lines[lines.length - 1].length < 1) lines.pop();

  const pages: ReplayTextPage[] = [];
  const perPage = Math.max(1, maxLines);
  for (let start = 0; start < lines.length; start += perPage) {
    const chunk = lines.slice(start, start + perPage);
    pages.push({ lines: chunk, charCount: chunk.reduce((sum, line) => sum + [...line].length, 0) });
  }
  return pages.length > 0 ? pages : [{ lines: [''], charCount: 0 }];
}

function breakParagraph(paragraph: string, measure: ReplayTextMeasure, maxWidth: number): string[] {
  if (paragraph.length < 1) return [''];
  const units = unitsOf(paragraph);
  const lines: string[] = [];
  let line = '';

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const candidate = line + unit;
    if (line.length < 1) {
      line = startLine(unit, measure, maxWidth, lines);
      continue;
    }
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (NO_LINE_START.has(firstChar(unit))) {
      line = candidate;
      continue;
    }
    let carried = '';
    while (line.length > 0 && NO_LINE_END.has(lastChar(line))) {
      carried = lastChar(line) + carried;
      line = line.slice(0, -lastChar(line).length);
    }
    lines.push(line.trimEnd());
    line = startLine((carried + unit).trimStart(), measure, maxWidth, lines);
  }
  if (line.length > 0 || lines.length < 1) lines.push(line.trimEnd());
  return lines;
}

/** The places a line may break, as units: a whole word, a space, or one character of Japanese. */
function unitsOf(paragraph: string): string[] {
  const units: string[] = [];
  let word = '';
  for (const char of graphemes(paragraph)) {
    if (WORD_CHAR.test(char)) {
      word += char;
      continue;
    }
    if (word.length > 0) {
      units.push(word);
      word = '';
    }
    units.push(char);
  }
  if (word.length > 0) units.push(word);
  return units;
}

/**
 * Starts a new line with a run of text, breaking it where it must when it is wider than a whole
 * line: the full lines go out, and what is left over is the line it returns.
 */
function startLine(text: string, measure: ReplayTextMeasure, maxWidth: number, lines: string[]): string {
  if (measure(text) <= maxWidth) return text;
  const pieces = breakLongUnit(text, measure, maxWidth);
  lines.push(...pieces.slice(0, -1));
  return pieces[pieces.length - 1];
}

function breakLongUnit(unit: string, measure: ReplayTextMeasure, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const char of graphemes(unit)) {
    if (piece.length > 0 && measure(piece + char) > maxWidth) {
      pieces.push(piece);
      piece = '';
    }
    piece += char;
  }
  pieces.push(piece);
  return pieces;
}

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  }
  return [...text];
}

function firstChar(text: string): string {
  return [...text][0] ?? '';
}

function lastChar(text: string): string {
  const chars = [...text];
  return chars[chars.length - 1] ?? '';
}

/** How fast a language is read, in characters a second, for subtitles that stay long enough. */
const CHARS_PER_SECOND: Readonly<Record<string, number>> = { ja: 7, ko: 9, en: 15 };

export const REPLAY_PAGE_MIN_MS = 1_800;
export const REPLAY_PAGE_MAX_MS = 9_000;
const REPLAY_PAGE_BASE_MS = 800;

/**
 * How long a page of a subtitle stays: a moment to find it, and time to read its characters at
 * the pace of the language, never shorter than a glance nor longer than a long look. `speed`
 * scales the reading pace (2 reads twice as fast).
 */
export function replayPageDurationMs(page: ReplayTextPage, lang: string, speed = 1): number {
  const perSecond = (CHARS_PER_SECOND[lang] ?? CHARS_PER_SECOND['ja']) * Math.max(0.25, speed);
  const ms = REPLAY_PAGE_BASE_MS + (page.charCount / perSecond) * 1000;
  return Math.round(Math.min(REPLAY_PAGE_MAX_MS, Math.max(REPLAY_PAGE_MIN_MS, ms)));
}
