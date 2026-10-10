/**
 * The length and a 32-bit FNV-1a hash of a string.
 *
 * Enough to tell whether a long output changed at all, so a spec can pin one without spelling the
 * whole of it out.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16).padStart(8, '0')}`;
}

/** A small deterministic source of numbers in [0, 1), so a spec's scattered inputs are the same on every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
