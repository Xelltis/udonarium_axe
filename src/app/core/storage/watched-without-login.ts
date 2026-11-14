const STORAGE_KEY = 'udonarium-axe.watched-without-login';

/** The rooms this tab's reader chose to watch rather than log in for, by key. */
function roomsWatched(): string[] {
  try {
    const read: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(read) ? read.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Whether this tab's reader chose to watch a room rather than log in for it, so that a reload does
 * not ask again.
 *
 * It lives in session storage, so it lasts for the tab and is not shared with other tabs. Where
 * storage is unavailable nothing is kept and nothing is thrown, and the reader is asked again.
 */
export function hasWatchedWithoutLogin(roomKey: string): boolean {
  return roomsWatched().includes(roomKey);
}

/** Notes that this tab's reader chose to watch a room rather than log in for it. */
export function noteWatchedWithoutLogin(roomKey: string): void {
  try {
    const watched = roomsWatched();
    if (!watched.includes(roomKey)) sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...watched, roomKey]));
  } catch {
    return;
  }
}
