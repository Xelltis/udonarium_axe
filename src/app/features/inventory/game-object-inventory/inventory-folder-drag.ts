export const FOLDER_DROPZONE_SELECTOR = '[data-folder-dropzone]';
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
