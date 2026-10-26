import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { generateUuid } from '@axe/core/util/uuid';
/** What a key this browser makes for itself starts with, apart from a tab's own id and an account's. */
const OWNER_KEY_PREFIX = 'owner_';

/**
 * The key this browser holds what it adds to a room by, kept across its tabs and visits, and made the
 * first time it is asked for; null where the browser keeps nothing.
 *
 * A tab's own user id lasts as long as the tab, so a player who closes it and comes back next week
 * is somebody else by it. The pictures and sounds they added, and the tags they kept to themselves,
 * are still theirs by this key.
 */
export function loadOrCreateOwnerKey(): string | null {
  try {
    const held = readLocal(STORAGE_KEYS.ownerKey);
    if (held) return held;
    const made = `${OWNER_KEY_PREFIX}${generateUuid()}`;
    return writeLocal(STORAGE_KEYS.ownerKey, made) ? made : null;
  } catch {
    return null;
  }
}
