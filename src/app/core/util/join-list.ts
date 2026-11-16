/**
 * A list of names as one phrase in the reader's language: "A、B、C" in Japanese, "A, B, and C" in
 * English. A language the browser does not know falls back to commas.
 */
export function joinList(items: readonly string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}
