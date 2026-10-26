import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
/** Whether the DJ deck was left open in this browser; closed when nothing is kept or it cannot be read. */
export function readDeckOpen(): boolean {
  return readLocal(STORAGE_KEYS.djDeckOpen) === '1';
}

/** Keeps whether the DJ deck is open in this browser. */
export function writeDeckOpen(open: boolean): void {
  writeLocal(STORAGE_KEYS.djDeckOpen, open ? '1' : '');
}
