import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { BoundedMap } from '@axe/core/util/bounded-map';
/** The most readings kept; the least recently made go first. */
export const AUDIO_ANALYSIS_CACHE_LIMIT = 400;

/**
 * The readings kept in this browser, as written, the least recently made going first past the
 * limit; empty when there are none or they cannot be read.
 */
export function readAnalysisCache(): BoundedMap<string, string> {
  const cache = new BoundedMap<string, string>(AUDIO_ANALYSIS_CACHE_LIMIT);
  try {
    const raw = readLocal(STORAGE_KEYS.audioAnalyses);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return cache;
    for (const [identifier, text] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof text === 'string') cache.set(identifier, text);
    }
  } catch {
    cache.clear();
  }
  return cache;
}

/** Keeps the readings in this browser. */
export function writeAnalysisCache(cache: ReadonlyMap<string, string>): void {
  writeLocal(STORAGE_KEYS.audioAnalyses, JSON.stringify(Object.fromEntries(cache)));
}
