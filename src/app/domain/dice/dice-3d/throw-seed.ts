/**
 * The seed a roll is thrown with, worked out from what every peer already shares about it, so
 * each of them throws the dice the same way without being told how.
 *
 * Another attempt at the same roll, after a throw that came out badly, gets another seed.
 */
export function throwSeedOf(key: string, attempt = 0): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= Math.imul(attempt + 1, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0 || 1;
}
