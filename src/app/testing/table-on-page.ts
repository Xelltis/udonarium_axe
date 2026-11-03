import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/**
 * Has the table drawn by the page itself rather than on a canvas, which a seat now draws it on by
 * default: for the specs of the page's own table and pieces, which a canvas leaves unseen.
 */
export function drawTableOnPage(): void {
  localStorage.setItem(STORAGE_KEYS.tableRenderer, 'css');
}
