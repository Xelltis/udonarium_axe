import { toHalfWidth } from '@axe/core/util/string-util';

const TERM_SEPARATOR = /[\s\u3000]+/;

/**
 * Puts text in the form search compares, half-width, lowercase and trimmed; apply it to the text
 * being searched before `matchesSearchText`.
 */
export function normalizeSearchText(value: string): string {
  return toHalfWidth(value).toLowerCase().trim();
}

/** Splits a search query into normalized terms at spaces, full-width ones included, dropping empty terms. */
export function splitSearchTerms(query: string): string[] {
  return normalizeSearchText(query)
    .split(TERM_SEPARATOR)
    .filter((term) => term.length > 0);
}

/**
 * Whether the searched text contains every term; with no terms, everything matches.
 *
 * The text is expected to be normalized with `normalizeSearchText` already, as the
 * terms from `splitSearchTerms` are.
 */
export function matchesSearchText(searchText: string, terms: readonly string[]): boolean {
  return terms.every((term) => searchText.includes(term));
}
