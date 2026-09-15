import { toHalfWidth } from '@axe/core/util/string-util';
import { matchesSearchText, normalizeSearchText, splitSearchTerms } from '@axe/core/util/text-search';
import type { PaletteRow } from '@axe/domain/chat/palette-rows';

/** A run of a palette line, marked where a word searched for stands in it. */
export interface PaletteSearchSegment {
  text: string;
  hit: boolean;
}

/** A palette line a search found, with the heading it sits under and where the words stand in it. */
export interface PaletteSearchResult {
  row: PaletteRow;
  /** The heading the line is written under, or empty for a line before the first heading. */
  heading: string;
  segments: PaletteSearchSegment[];
}

/**
 * The palette lines holding every word of a search, sorted for the list under the palette.
 *
 * Only lines that are said are searched; headings, settings and blank lines are left out. Width
 * and case are ignored, and the words are split at spaces, full-width ones included. A line that
 * begins with a word comes first, then lines by how early a word stands in them, then the palette's
 * own order. A search with no words finds nothing.
 */
export function searchPaletteRows(rows: readonly PaletteRow[], query: string): PaletteSearchResult[] {
  const terms = splitSearchTerms(query);
  if (terms.length === 0) return [];

  const found: { result: PaletteSearchResult; position: number }[] = [];
  let heading = '';
  for (const row of rows) {
    if (row.kind === 'heading') {
      heading = (row.headingName ?? '').trim();
      continue;
    }
    if (row.kind !== 'command') continue;

    const searched = normalizeSearchText(row.text);
    if (!matchesSearchText(searched, terms)) continue;
    const position = Math.min(...terms.map((term) => searched.indexOf(term)));
    found.push({ result: { row, heading, segments: highlightSearchTerms(row.text, terms) }, position });
  }

  return found
    .sort((a, b) => a.position - b.position || a.result.row.lineIndex - b.result.row.lineIndex)
    .map((entry) => entry.result);
}

/**
 * A line split into runs, marked where any of the words stand, keeping the line as it is written.
 *
 * The places are found ignoring width and case, as the search is, and places that overlap or touch
 * run together. A line where no word stands comes back as one unmarked run, and an empty line as
 * none.
 */
export function highlightSearchTerms(text: string, terms: readonly string[]): PaletteSearchSegment[] {
  if (text.length === 0) return [];

  const folded = toHalfWidth(text).toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  if (folded.length === text.length) {
    for (const term of terms) {
      if (term.length === 0) continue;
      for (let at = folded.indexOf(term); at >= 0; at = folded.indexOf(term, at + 1)) {
        marked.fill(true, at, at + term.length);
      }
    }
  }

  const segments: PaletteSearchSegment[] = [];
  for (let index = 0; index < text.length; index++) {
    const last = segments.at(-1);
    if (last && last.hit === marked[index]) last.text += text[index];
    else segments.push({ text: text[index], hit: marked[index] });
  }
  return segments;
}
