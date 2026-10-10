const STORAGE_PREFIX = 'axe.inventory.personal-folders';

/** Reading the property throws where the browser is set to block site data, not only where it is absent. */
export function personalFolderStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function storageKey(roomId: string): string {
  return roomId.length > 0 ? `${STORAGE_PREFIX}.${roomId}` : STORAGE_PREFIX;
}

/**
 * The personal inventory tab's folders kept in this browser for a room.
 *
 * Empty without storage or when what is stored cannot be read, and anything that is not a non-empty
 * string is dropped. An empty room id reads the entry kept outside any room.
 */
export function readPersonalFolders(storage: Storage | null, roomId: string): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey(roomId)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  } catch {
    return [];
  }
}

/**
 * Keeps the personal inventory tab's folders in this browser for a room. A storage that refuses the
 * write is ignored.
 */
export function writePersonalFolders(storage: Storage | null, roomId: string, folderPaths: readonly string[]): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(roomId), JSON.stringify([...folderPaths]));
  } catch {
    // A browser that refuses to store this still has to run.
  }
}
