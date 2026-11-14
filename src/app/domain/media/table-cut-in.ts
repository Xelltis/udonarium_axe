import { clamp } from '@axe/core/util/clamp';
/** How a table remembers which cut-ins to play, and how one of them is drawn. */

/** Reads the comma-separated list a table holds, dropping blanks and repeats. */
export function parseCutInIdentifiers(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const identifier = part.trim();
    if (identifier.length > 0) seen.add(identifier);
  }
  return [...seen];
}

/** Writes the list back in the form a table holds it. */
export function encodeCutInIdentifiers(identifiers: readonly string[]): string {
  return parseCutInIdentifiers(identifiers.join(',')).join(',');
}

/**
 * Draws one of the cut-ins that are still around.
 *
 * `roll` takes how many there are and hands back which one, so a spec can say
 * which is drawn and the table can leave it to chance.
 */
export function pickCutInIdentifier(
  identifiers: readonly string[],
  isAvailable: (identifier: string) => boolean,
  roll: (count: number) => number
): string | null {
  const candidates = identifiers.filter(isAvailable);
  if (candidates.length < 1) return null;
  if (candidates.length === 1) return candidates[0];

  const index = Math.floor(roll(candidates.length));
  if (!Number.isFinite(index)) return candidates[0];
  return candidates[clamp(index, 0, candidates.length - 1)];
}

/** The draw the table itself makes. */
export function rollCutIn(count: number): number {
  return Math.floor(Math.random() * count);
}
