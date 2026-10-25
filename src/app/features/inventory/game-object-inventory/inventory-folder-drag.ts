/**
 * A folder's heading, and the area holding the heading and whatever is open beneath it. A drop
 * anywhere in the area files into the folder; a folder inside another has an area of its own,
 * which is the nearer one.
 */
export const FOLDER_DROPZONE_SELECTOR = '[data-folder-dropzone], [data-folder-area]';
export const FOLDER_PATH_ATTRIBUTE = 'data-folder-path';

/**
 * The folder path of the drop zone an element sits in, null when it is in none, and empty for a
 * zone that names no path.
 */
export function folderPathFromElement(element: Element | null): string | null {
  const dropzone = element?.closest(FOLDER_DROPZONE_SELECTOR);
  if (!dropzone) return null;
  return dropzone.getAttribute(FOLDER_PATH_ATTRIBUTE) ?? '';
}

/** An inventory tab, which takes pieces let go over it into the place it shows. */
export const INVENTORY_TAB_DROPZONE_SELECTOR = '[data-inventory-tab]';
export const INVENTORY_TAB_ATTRIBUTE = 'data-inventory-tab';

/** The tab an element sits in, null when it is in none. */
export function inventoryTabFromElement(element: Element | null): string | null {
  return element?.closest(INVENTORY_TAB_DROPZONE_SELECTOR)?.getAttribute(INVENTORY_TAB_ATTRIBUTE) ?? null;
}
