import { readingOf } from '@axe/features/effect/effect-library-panel/effect-readings';

/** A run of a text, and whether it is what the search asked for. */
export interface HighlightPart {
  readonly text: string;
  readonly hit: boolean;
}

const KATAKANA_FIRST = 0x30a1;
const KATAKANA_LAST = 0x30f6;
const KANA_SHIFT = 0x60;

/**
 * A text as the search compares it, character for character: letters in lower case and katakana as
 * hiragana, so that neither the case nor the kind of kana typed matters.
 */
function foldEach(text: string): string {
  let folded = '';
  for (const unit of text) {
    const code = unit.codePointAt(0) ?? 0;
    folded +=
      code >= KATAKANA_FIRST && code <= KATAKANA_LAST ? String.fromCodePoint(code - KANA_SHIFT) : unit.toLowerCase();
  }
  return folded;
}

/**
 * A text as the search compares it: full-width letters and half-width kana brought to their plain
 * forms, letters in lower case and katakana as hiragana.
 */
export function foldForSearch(text: string): string {
  return foldEach(text.normalize('NFKC'));
}

/** The words a search asks for, as the search compares them; none for a blank search. */
export function searchTerms(query: string): string[] {
  return foldForSearch(query)
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/**
 * What a search is compared with for the texts an effect is found by: each as written and as it is
 * read, so that one named in kanji is found by its reading too.
 */
export function searchTextOf(fields: readonly string[]): string {
  return fields
    .flatMap((field) => {
      const written = foldForSearch(field);
      const read = foldForSearch(readingOf(field));
      return read === written ? [written] : [written, read];
    })
    .join('\n');
}

/** Whether a text made by {@link searchTextOf} holds every word of a search; a blank search matches everything. */
export function matchesSearch(searchText: string, query: string): boolean {
  return searchTerms(query).every((term) => searchText.includes(term));
}

/**
 * A text cut into the runs a search asked for and the runs between them, in order, for the runs
 * asked for to be marked. Only what matches as written is marked: an effect found by its reading is
 * shown with nothing marked. A blank search and a text holding none of it come back as one run.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const terms = searchTerms(query);
  const folded = foldEach(text);
  if (terms.length < 1 || text.length < 1 || folded.length !== text.length) return [{ text, hit: false }];

  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    for (let at = folded.indexOf(term); at >= 0; at = folded.indexOf(term, at + term.length)) {
      marked.fill(true, at, at + term.length);
    }
  }

  const parts: HighlightPart[] = [];
  let from = 0;
  for (let at = 1; at <= text.length; at++) {
    if (at < text.length && marked[at] === marked[from]) continue;
    parts.push({ text: text.slice(from, at), hit: marked[from] });
    from = at;
  }
  return parts;
}
