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
  return summaryTagSpans(raw).map((span) => span.tag);
}

/** One item of a display-item line, with where it stands in the line as written, quotes and all. */
interface SummaryTagSpan {
  readonly tag: string;
  readonly start: number;
  readonly end: number;
}

function summaryTagSpans(raw: string): SummaryTagSpan[] {
  const text = raw ?? '';
  const spans: SummaryTagSpan[] = [];
  let current = '';
  let start = 0;
  let quoted = false;

  const take = (end: number): void => {
    if (current.length > 0) spans.push({ tag: current, start, end });
    current = '';
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      take(quoted ? index + 1 : index);
      quoted = !quoted;
      start = quoted ? index : index + 1;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      take(index);
      start = index + 1;
      continue;
    }
    current += char;
  }
  take(text.length);

  return spans;
}

/**
 * How a name is written as a display item: a slash or a backslash in it is escaped, so it is not
 * read as a path, and a name with a space in it goes in quotes. A name with a quote in it cannot be
 * written at all.
 */
export function summaryTagFor(name: string): string {
  const escaped = name.replace(/[\\/]/g, '\\$&');
  return /\s/.test(escaped) ? `"${escaped}"` : escaped;
}

/** Adds a name to the end of a display-item line, written as {@link summaryTagFor} writes it. */
export function appendSummaryTag(raw: string, name: string): string {
  const head = (raw ?? '').trimEnd();
  return head.length > 0 ? `${head} ${summaryTagFor(name)}` : summaryTagFor(name);
}

/**
 * Takes every item ending in the given name out of a display-item line, along with the space that
 * set it apart. The rest stays as it was written, its order, line breaks and quotes included; where
 * the items on either side were written up against it, a space keeps them apart.
 */
export function removeSummaryTag(raw: string, name: string): string {
  let text = raw ?? '';
  for (const span of summaryTagSpans(text).reverse()) {
    if (tagLeafNames([span.tag])[0] !== name) continue;
    let { start, end } = span;
    const spaceAfter = /^\s*/.exec(text.slice(end))?.[0].length ?? 0;
    if (end + spaceAfter < text.length) end += spaceAfter;
    else start -= /\s*$/.exec(text.slice(0, start))?.[0].length ?? 0;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const touching = before.length > 0 && after.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
    text = before + (touching ? ' ' : '') + after;
  }
  return text;
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
