/** How many motions a model may be given. */
export const MAX_MODEL_MOTION_FILES = 24;

/**
 * The identifiers of the motions written down for a model, each once and no more than a model may be
 * given; none for what is empty or cannot be read.
 */
export function motionFileIdsOf(written: string): string[] {
  if (!written) return [];
  try {
    const read: unknown = JSON.parse(written);
    if (!Array.isArray(read)) return [];
    const ids = read.filter((id): id is string => typeof id === 'string' && id.length > 0);
    return [...new Set(ids)].slice(0, MAX_MODEL_MOTION_FILES);
  } catch {
    return [];
  }
}

/** The motions given to a model as they are written down: empty for none. */
export function writeMotionFileIds(ids: readonly string[]): string {
  const kept = [...new Set(ids.filter((id) => id.length > 0))].slice(0, MAX_MODEL_MOTION_FILES);
  return kept.length > 0 ? JSON.stringify(kept) : '';
}
