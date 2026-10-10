import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { DataElement } from '@axe/domain/data/data-element';
import { settleElementRole } from '@axe/domain/data/data-element-templates';

/**
 * What it takes to put a deleted element back where it was.
 *
 * The element is kept as XML rather than as the object, because a destroyed identifier is never
 * used again: what comes back is a copy under new identifiers, holding the same names and values.
 */
export interface ElementRestorePoint {
  xml: string;
  parentId: string;
  /** The sibling it stood just before, or empty when it was the last. */
  beforeId: string;
  /** Its place among its siblings, for when the one it stood before is gone too. */
  index: number;
  name: string;
}

/** Takes down what an element needs to be put back, before it is destroyed. Null for one with no parent element. */
export function captureElementRestorePoint(element: DataElement): ElementRestorePoint | null {
  const parent = element.parent;
  if (!(parent instanceof DataElement)) return null;
  const siblings = parent.children;
  const index = siblings.indexOf(element);
  return {
    xml: element.toXml(),
    parentId: parent.identifier,
    beforeId: siblings[index + 1]?.identifier ?? '',
    index,
    name: element.name,
  };
}

/**
 * Puts a deleted element back as a copy, in the place it was taken down from.
 *
 * It goes before the sibling it stood before, or where that is gone too, at the place it had. A name
 * taken in the meantime by another sibling is made unique. Null when the parent is gone as well, or
 * the XML no longer reads as an element.
 */
export function restoreElementFromPoint(
  point: ElementRestorePoint,
  find: (identifier: string) => DataElement | null | undefined
): DataElement | null {
  const parent = find(point.parentId);
  if (!(parent instanceof DataElement)) return null;
  const restored = ObjectSerializer.instance.parseXml(point.xml);
  if (!(restored instanceof DataElement)) {
    restored?.destroy();
    return null;
  }
  restored.name = DataElement.createUniqueSiblingName(parent, point.name);
  const before = point.beforeId ? find(point.beforeId) : null;
  const reference = before?.parent === parent ? before : (parent.children[point.index] ?? null);
  if (reference) parent.insertBefore(restored, reference);
  else parent.appendChild(restored);
  settleElementRole(restored);
  return restored;
}
