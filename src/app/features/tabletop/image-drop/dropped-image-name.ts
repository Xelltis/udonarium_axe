import { withoutExtension } from '@axe/core/util/file-name';

/**
 * The name for a character made from a dropped image: the file name without its extension, or the
 * fallback when nothing is left.
 */
export function characterNameFromFileName(fileName: string, fallback: string): string {
  const baseName = withoutExtension(fileName).trim();
  return baseName.length > 0 ? baseName : fallback;
}
