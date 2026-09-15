import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface Lockable {
  isLock: boolean;
}

/**
 * Whether a tabletop object carries a lock flag, so that a caller can leave locked pieces behind
 * when moving several at once.
 */
export function isLockable(obj: TabletopObject): obj is TabletopObject & Lockable {
  return typeof (obj as unknown as Partial<Lockable>).isLock === 'boolean';
}
