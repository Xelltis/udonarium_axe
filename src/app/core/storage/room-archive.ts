export const CCFOLIA_ROOM_DATA_ENTRY = '__data.json';

export type ArchiveEntries = Record<string, Uint8Array>;

/**
 * Recognises a room archive from the other tool. Our own carries room data instead, so the two never collide.
 */
export function isCcfoliaRoomArchive(entryNames: readonly string[]): boolean {
  return ccfoliaRoomFolderOf(entryNames) !== null;
}

/**
 * The folder a room archive from the other tool keeps its room data in: empty when it lies at the
 * top, as saved, and the folder's path, slash and all, for one packed again inside a folder. Null
 * for an archive that is not one.
 */
export function ccfoliaRoomFolderOf(entryNames: readonly string[]): string | null {
  const entry = entryNames.find(
    (name) => name === CCFOLIA_ROOM_DATA_ENTRY || name.endsWith(`/${CCFOLIA_ROOM_DATA_ENTRY}`)
  );
  return entry === undefined ? null : entry.slice(0, entry.length - CCFOLIA_ROOM_DATA_ENTRY.length);
}
