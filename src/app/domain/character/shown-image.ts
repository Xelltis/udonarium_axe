import type { DataElement } from '@axe/domain/data/data-element';

/**
 * The picture a piece shows on the table, by image identifier.
 *
 * Where the sheet has an `ICON` resource, its current value picks one of the pictures, held to the
 * last one; otherwise the picture named by `imageIdentifier` is used. Empty when nothing is found.
 */
export function shownImageIdentifier(images: DataElement | null, detail: DataElement | null): string {
  if (!images) return '';
  const icon = detail?.getFirstElementByName('ICON');
  if (!icon || !icon.isNumberResource) {
    const image = images.getFirstElementByName('imageIdentifier');
    return typeof image?.value === 'string' ? image.value : '';
  }
  const count = images.children.length;
  const picked = Math.min(Number(icon.currentValue), count - 1);
  if (count === 0 || !(picked >= 0)) return '';
  const value = (images.children[picked] as DataElement).value;
  return typeof value === 'string' ? value : '';
}
