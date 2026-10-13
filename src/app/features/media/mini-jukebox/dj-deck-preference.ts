/** Where whether the DJ deck is open under the mini player is kept in this browser. */
export const DJ_DECK_OPEN_STORAGE_KEY = 'mini-jukebox-dj-deck';

/** Whether the DJ deck was left open in this browser; closed when nothing is kept or it cannot be read. */
export function readDeckOpen(): boolean {
  try {
    return localStorage.getItem(DJ_DECK_OPEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Keeps whether the DJ deck is open in this browser. */
export function writeDeckOpen(open: boolean): void {
  try {
    localStorage.setItem(DJ_DECK_OPEN_STORAGE_KEY, open ? '1' : '');
  } catch {
    // Private browsing refuses the write; the deck stays as it is for this session.
  }
}
