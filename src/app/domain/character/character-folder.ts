export const FOLDER_SEPARATOR = '/';
export const MAX_FOLDER_DEPTH = 4;

const FULL_WIDTH_SEPARATOR = /／/g;

/**
 * Splits a character's folder path into its folder names.
 *
 * A full-width slash counts as a separator, blank segments are dropped, and anything past the
 * fourth level is cut off.
 */
export function folderSegments(path: string): string[] {
  return path
    .replace(FULL_WIDTH_SEPARATOR, FOLDER_SEPARATOR)
    .split(FOLDER_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .slice(0, MAX_FOLDER_DEPTH);
}

/**
 * The folder path as it is stored: trimmed names joined with `/`, at most four deep. Empty for no
 * folder.
 */
export function normalizeFolderPath(raw: string): string {
  return folderSegments(raw).join(FOLDER_SEPARATOR);
}

/** The folder one level up. Empty for a top-level folder. */
export function parentFolderPath(path: string): string {
  return folderSegments(path).slice(0, -1).join(FOLDER_SEPARATOR);
}

/** Every folder on the way down to this one, from the top level, the folder itself included. */
export function ancestorFolderPaths(path: string): string[] {
  const segments = folderSegments(path);
  const paths: string[] = [];
  for (let length = 1; length <= segments.length; length++) {
    paths.push(segments.slice(0, length).join(FOLDER_SEPARATOR));
  }
  return paths;
}

/** Whether the path is the folder itself or lies inside it. Nothing lies inside the empty root. */
export function isDescendantFolderPath(path: string, ancestor: string): boolean {
  if (ancestor.length < 1) return false;
  return path === ancestor || path.startsWith(ancestor + FOLDER_SEPARATOR);
}

/**
 * Moves a path that lies in a renamed folder under the new name, keeping whatever sits below it.
 *
 * A path outside that folder comes back unchanged, and renaming to an empty name takes the path out
 * of every folder.
 */
export function rewriteFolderPath(path: string, from: string, to: string): string {
  if (!isDescendantFolderPath(path, from)) return path;
  const destination = normalizeFolderPath(to);
  if (destination.length < 1) return '';
  return normalizeFolderPath(destination + path.slice(from.length));
}
