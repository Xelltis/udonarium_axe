/** How many folded sections are remembered; the oldest go first past this. */
export const MAX_FOLDED_SECTIONS = 200;

/**
 * The names of the sheet sections a reader has folded, read from what was written down.
 *
 * Anything that is not a list of names reads as nothing folded, so a store written by something
 * else, or cut short, never folds a section by surprise.
 */
export function parseFoldedSections(stored: string | null): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const names = parsed.filter((name): name is string => typeof name === 'string' && name.length > 0);
    return [...new Set(names)].slice(-MAX_FOLDED_SECTIONS);
  } catch {
    return [];
  }
}

/** The names of the folded sections as they are written down, the newest last. */
export function formatFoldedSections(names: readonly string[]): string {
  return JSON.stringify([...new Set(names)].slice(-MAX_FOLDED_SECTIONS));
}
