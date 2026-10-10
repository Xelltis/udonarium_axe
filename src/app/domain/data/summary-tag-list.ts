/**
 * The display items of a room, as one line of text.
 *
 * Names are written apart by spaces, and a bare `/` is a line break in the views that have
 * lines to break. A name with a space in it, or one that has to be reached by its path through
 * the sheet, is written in quotes: `"リソース/正気度"`. The quotes come off here, so what
 * everything downstream receives is a reference like any other.
 */

/** A `/` on its own, which asks the view for a line break rather than naming an item. */
export const SUMMARY_NEW_LINE = '/';

/**
 * Splits a room's display-item line into item names, taking the quotes off quoted names.
 *
 * Whitespace outside quotes separates names, a quote also ends the name before it, and empty names are
 * dropped. A `/` on its own comes through as {@link SUMMARY_NEW_LINE}.
 */
export function splitSummaryTags(raw: string): string[] {
  const tags: string[] = [];
  let current = '';
  let quoted = false;

  const take = (): void => {
    if (current.length > 0) tags.push(current);
    current = '';
  };

  for (const char of raw ?? '') {
    if (char === '"') {
      take();
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      take();
      continue;
    }
    current += char;
  }
  take();

  return tags;
}

/**
 * The name at the end of each item, which is the one a sheet shows on the field itself.
 *
 * A rename is noticed by the name, so an item reached by its path has to be watched by its last
 * part; renaming a group along the way breaks the path, as it does anywhere a name is a
 * reference.
 */
export function tagLeafNames(tags: readonly string[]): string[] {
  const names: string[] = [];
  for (const tag of tags) {
    if (tag === SUMMARY_NEW_LINE) continue;
    const parts = tag.split(/(?<!\\)\//);
    const leaf = (parts[parts.length - 1] ?? '').replace(/\\\//g, '/').trim();
    if (leaf.length > 0 && !names.includes(leaf)) names.push(leaf);
  }
  return names;
}
