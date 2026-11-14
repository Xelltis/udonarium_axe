import type { CatalogItem } from '@axe/core/sync/object-store';

/**
 * A catalogue boiled down to two numbers, which two peers compare to tell whether they hold the
 * same objects at the same versions without sending the catalogue itself.
 */
export interface CatalogDigest {
  /** How many objects the catalogue lists. */
  count: number;
  /** The hashes of every identifier and version, added up, so the order they are listed in does not matter. */
  hash: number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const versionFloat = new Float64Array(1);
const versionWords = new Uint32Array(versionFloat.buffer);

function hashOf(item: CatalogItem): number {
  let hash = FNV_OFFSET;
  const identifier = item.identifier;
  for (let i = 0; i < identifier.length; i++) {
    hash = Math.imul(hash ^ identifier.charCodeAt(i), FNV_PRIME);
  }
  versionFloat[0] = item.version;
  hash = Math.imul(hash ^ versionWords[0], FNV_PRIME);
  hash = Math.imul(hash ^ versionWords[1], FNV_PRIME);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  return hash >>> 0;
}

/** The digest of a catalogue: one pass over it, a few thousand objects costing about a millisecond. */
export function digestOf(catalog: Iterable<CatalogItem>): CatalogDigest {
  let count = 0;
  let hash = 0;
  for (const item of catalog) {
    count++;
    hash = (hash + hashOf(item)) >>> 0;
  }
  return { count, hash };
}

/** Whether two digests are of catalogues listing the same objects at the same versions. */
export function sameDigest(a: CatalogDigest, b: CatalogDigest): boolean {
  return a.count === b.count && a.hash === b.hash;
}

/** Whether something received is shaped like a digest. */
export function isCatalogDigest(data: unknown): data is CatalogDigest {
  const digest = data as Partial<CatalogDigest> | null;
  return !!digest && Number.isFinite(digest.count) && Number.isFinite(digest.hash);
}
