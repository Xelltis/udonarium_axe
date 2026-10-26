import { toHalfWidth } from '@axe/core/util/string-util';
import { DataElement } from '@axe/domain/data/data-element';
import { type SortKey, SortOrder } from '@axe/domain/data/data-summary-setting';
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
 * Sorts pieces in place by the data element each step of the order names, in turn, and returns the
 * same array.
 *
 * A later step is read only where the earlier ones leave two pieces level, which they also do where
 * neither carries an element under a step's name. A piece that carries none goes after the one that
 * does. A step with no name is passed over, and an empty first step leaves the whole order as it was.
 */
export function sortObjectsByKeys(objects: TabletopObject[], keys: readonly SortKey[]): TabletopObject[] {
  const steps = keys
    .map(({ tag, order }) => ({ tag: tag.trim(), direction: order === SortOrder.ASC ? -1 : 1 }))
    .filter((step, index) => index === 0 || step.tag.length > 0);
  if (steps.length < 1 || steps[0].tag.length < 1) return objects;

  objects.sort((a, b) => {
    for (const { tag, direction } of steps) {
      const aElm = a.rootDataElement ? DataElement.findElementByReference(a.rootDataElement, tag) : null;
      const bElm = b.rootDataElement ? DataElement.findElementByReference(b.rootDataElement, tag) : null;
      if (!aElm && !bElm) continue;
      if (!bElm) return -1;
      if (!aElm) return 1;

      const aValue = toSortableValue(aElm);
      const bValue = toSortableValue(bElm);
      if (aValue < bValue) return direction;
      if (aValue > bValue) return direction * -1;
    }
    return 0;
  });

  return objects;
}
