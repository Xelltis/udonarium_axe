import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
/** The most readings kept; the least recently made go first. */
export const AUDIO_ANALYSIS_CACHE_LIMIT = 400;

/** The readings kept in this browser, as written; empty when there are none or they cannot be read. */
export function readAnalysisCache(): Map<string, string> {
  try {
    const raw = readLocal(STORAGE_KEYS.audioAnalyses);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  } catch {
    return new Map();
  }
}

/** Keeps the readings in this browser, letting the oldest go past the limit. */
export function writeAnalysisCache(cache: Map<string, string>): void {
  while (cache.size > AUDIO_ANALYSIS_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== 'string') break;
    cache.delete(oldest);
  }
  writeLocal(STORAGE_KEYS.audioAnalyses, JSON.stringify(Object.fromEntries(cache)));
}
