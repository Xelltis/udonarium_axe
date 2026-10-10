/**
 * A file's name without its extension: the last dot and what follows it, where that holds no path
 * separator, so a folder with a dot in its name keeps it. A name without an extension comes back as
 * it is.
 */
export function withoutExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}
