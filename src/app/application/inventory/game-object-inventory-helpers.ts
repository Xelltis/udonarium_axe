import { toHalfWidth } from '@axe/core/util/string-util';
import { DataElement } from '@axe/domain/data/data-element';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * The value a data element is sorted by: a resource's current value, otherwise its value.
 *
 * Full-width characters are folded to half-width and the text trimmed, so the result is a number
 * wherever the text reads as one and the text otherwise.
 */
export function toSortableValue(dataElement: DataElement): number | string {
  const value = dataElement.isNumberResource ? dataElement.currentValue : dataElement.value;
  const resultStr = toHalfWidth((value + '').trim());
  const resultNum = +resultStr;
  return Number.isNaN(resultNum) ? resultStr : resultNum;
}

/**
 * Sorts pieces in place by the data element named by the primary tag, then by the secondary tag,
 * and returns the same array.
 *
 * A piece that carries no element under a tag goes after the ones that do. An empty primary tag
 * leaves the order as it was.
 */
export function sortObjectsByTags(
  objects: TabletopObject[],
  sortTag: string,
  sortOrder: SortOrder,
  sortTag2nd: string,
  sortOrder2nd: SortOrder
): TabletopObject[] {
  const primaryTag = sortTag.length ? sortTag.trim() : '';
  const secondaryTag = sortTag2nd.length ? sortTag2nd.trim() : '';
  const primaryOrder = sortOrder === SortOrder.ASC ? -1 : 1;
  const secondaryOrder = sortOrder2nd === SortOrder.ASC ? -1 : 1;

  if (primaryTag.length < 1) return objects;

  objects.sort((a, b) => {
    const aElm = a.rootDataElement ? DataElement.findElementByReference(a.rootDataElement, primaryTag) : null;
    const bElm = b.rootDataElement ? DataElement.findElementByReference(b.rootDataElement, primaryTag) : null;
    if (!aElm && !bElm) return 0;
    if (!bElm) return -1;
    if (!aElm) return 1;

    const aValue = toSortableValue(aElm);
    const bValue = toSortableValue(bElm);
    if (aValue < bValue) return primaryOrder;
    if (aValue > bValue) return primaryOrder * -1;

    const aElm2nd = a.rootDataElement ? DataElement.findElementByReference(a.rootDataElement, secondaryTag) : null;
    const bElm2nd = b.rootDataElement ? DataElement.findElementByReference(b.rootDataElement, secondaryTag) : null;
    if (!aElm2nd && !bElm2nd) return 0;
    if (!bElm2nd) return -1;
    if (!aElm2nd) return 1;

    const aValue2nd = toSortableValue(aElm2nd);
    const bValue2nd = toSortableValue(bElm2nd);
    if (aValue2nd < bValue2nd) return secondaryOrder;
    if (aValue2nd > bValue2nd) return secondaryOrder * -1;
    return 0;
  });

  return objects;
}
