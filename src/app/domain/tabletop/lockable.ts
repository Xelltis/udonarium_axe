import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/** The two names the lock flag goes by: most pieces call it `isLock`, a terrain `isLocked`. */
interface LockFlags {
  isLock?: unknown;
  isLocked?: unknown;
}

/**
 * Whether a tabletop object is locked in place, so that a caller moving several at once leaves it
 * behind.
 */
export function isLockedInPlace(obj: TabletopObject): boolean {
  const flags = obj as unknown as LockFlags;
  return flags.isLock === true || flags.isLocked === true;
}
