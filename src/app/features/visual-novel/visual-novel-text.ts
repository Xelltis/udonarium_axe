import { RubyPart, splitRubyNotation } from '@axe/ui/text-decoration/decorate-chat-text';

function createGraphemeSegmenter(): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  try {
    return new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  } catch {
    return null;
  }
}

const graphemeSegmenter = createGraphemeSegmenter();

/**
 * Splits text into the letters a reader sees, keeping emoji and combined characters whole.
 *
 * Where the browser has no grapheme segmenter it falls back to splitting by code point.
 */
export function toGraphemes(text: string): string[] {
  if (text.length < 1) return [];
  if (!graphemeSegmenter) return Array.from(text);
  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}

/**
 * Where each letter of a line ends, counted in the units a string is sliced by.
 *
 * A line is typed out one letter at a time, and cutting it by counting letters again on
 * every tick walks the whole line each time. The ends are worked out once, and each tick is
 * then one lookup and one cut.
 */
export function graphemeEnds(text: string): number[] {
  const ends: number[] = [];
  let at = 0;
  for (const grapheme of toGraphemes(text)) {
    at += grapheme.length;
    ends.push(at);
  }
  return ends;
}

/**
 * A line as it is typed out: the runs the ruby notation cuts it into, and its letters.
 *
 * Only the letters a reader sees are typed. The notation itself never shows, and a reading is
 * written over its word from the word's first letter on.
 */
export interface TypedLine {
  readonly parts: readonly RubyPart[];
  /** What a reader sees of the whole line, the readings left out. */
  readonly text: string;
  /** Where each letter ends in {@link text}. */
  readonly ends: readonly number[];
  /** Which run each letter is in. */
  readonly partOfLetter: readonly number[];
  /** Where each run begins in {@link text}. */
  readonly partStarts: readonly number[];
}

/** Prepares a line for typing out: cut into ruby runs, with every letter's end and run worked out once. */
export function typedLineOf(line: string): TypedLine {
  const parts = splitRubyNotation(line);
  const ends: number[] = [];
  const partOfLetter: number[] = [];
  const partStarts: number[] = [];
  let at = 0;
  parts.forEach((part, index) => {
    partStarts.push(at);
    for (const end of graphemeEnds(part.text)) {
      ends.push(at + end);
      partOfLetter.push(index);
    }
    at += part.text.length;
  });
  return { parts, text: parts.map((part) => part.text).join(''), ends, partOfLetter, partStarts };
}

/** What a reader sees of a line once this many of its letters are typed. */
export function typedTextOf(line: TypedLine, typed: number): string {
  if (typed < 1) return '';
  if (typed >= line.ends.length) return line.text;
  return line.text.slice(0, line.ends[typed - 1]);
}

/** The runs of a line once this many of its letters are typed, the last one cut where typing stands. */
export function typedPartsOf(line: TypedLine, typed: number): readonly RubyPart[] {
  if (typed < 1) return [];
  if (typed >= line.ends.length) return line.parts;
  const index = line.partOfLetter[typed - 1];
  const part = line.parts[index];
  const shown = line.parts.slice(0, index);
  shown.push({ text: part.text.slice(0, line.ends[typed - 1] - line.partStarts[index]), reading: part.reading });
  return shown;
}
