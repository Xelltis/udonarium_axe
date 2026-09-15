import { DataElement, DataElementRole, type DataElementRoleValue } from '@axe/domain/data/data-element';
import { ELEMENT_TEMPLATES_NAME } from '@axe/domain/data/data-element-templates';

export type DataElementDropPosition = 'before' | 'after' | 'inside';

export const MAX_STANDARD_DEPTH = 3;

/**
 * Whether something dragged may land inside the element rather than beside it, which is so of
 * anything but a field that holds a value.
 */
export function canDropInside(targetElement: DataElement): boolean {
  return targetElement.fieldRole !== DataElementRole.FIELD;
}

/**
 * Whether an element of a character sheet may hold a child of the given role.
 *
 * The sheet's `detail` root holds sections, a section holds groups, and a group holds fields or,
 * while it sits shallow enough to stay within the depth limit, further groups. Nothing else holds
 * anything.
 */
export function canAcceptChildRole(parentElement: DataElement, childRole: DataElementRoleValue): boolean {
  if (parentElement.name === 'detail') return childRole === DataElementRole.SECTION;
  if (parentElement.fieldRole === DataElementRole.SECTION) return childRole === DataElementRole.GROUP;
  if (parentElement.fieldRole === DataElementRole.GROUP) {
    if (childRole === DataElementRole.FIELD) return true;
    if (childRole === DataElementRole.GROUP) {
      return getElementDepth(parentElement) < MAX_STANDARD_DEPTH - 1;
    }
  }
  return false;
}

/**
 * How many data elements lie between the element and the sheet's `detail` root or the template
 * holder; 0 for one directly under either.
 */
export function getElementDepth(element: DataElement): number {
  let depth = 0;
  let parent = element.parent;
  while (parent instanceof DataElement && parent.name !== 'detail' && parent.name !== ELEMENT_TEMPLATES_NAME) {
    depth++;
    parent = parent.parent;
  }
  return depth;
}

/** How many levels of children hang below the element; 0 for one with no children. */
export function getSubtreeDepth(element: DataElement): number {
  let depth = 0;
  for (const child of element.children) {
    depth = Math.max(depth, getSubtreeDepth(child) + 1);
  }
  return depth;
}

/**
 * Whether the dragged element may land at a position around the target, the target sitting at
 * `targetDepth`.
 *
 * A drop is refused onto the element itself, into its own subtree, under a parent that does not
 * hold its role, or where its subtree would reach past the depth limit.
 */
export function canDropStructureElement(
  draggedElement: DataElement,
  targetElement: DataElement,
  position: DataElementDropPosition,
  targetDepth: number
): boolean {
  if (draggedElement === targetElement) return false;

  const newDepth = position === 'inside' ? targetDepth + 1 : targetDepth;
  if (newDepth + getSubtreeDepth(draggedElement) > MAX_STANDARD_DEPTH) return false;

  if (position === 'inside') {
    return (
      canDropInside(targetElement) &&
      canAcceptChildRole(targetElement, draggedElement.fieldRole) &&
      !draggedElement.contains(targetElement)
    );
  }

  const parent = targetElement.parent;
  return (
    parent instanceof DataElement &&
    canAcceptChildRole(parent, draggedElement.fieldRole) &&
    !draggedElement.contains(parent)
  );
}

/**
 * Which drop position the pointer's height over the target's row stands for.
 *
 * The top and bottom edges (12px, or less on a short row) mean before and after; the middle means
 * inside. Where the target cannot take children, or the row has no measured box, it falls back to
 * after.
 */
export function resolveDropPosition(
  hostRect: { top: number; height: number } | null,
  clientY: number,
  targetElement: DataElement
): DataElementDropPosition {
  if (!hostRect || hostRect.height <= 0) return canDropInside(targetElement) ? 'inside' : 'after';

  const edgeSize = Math.min(12, hostRect.height * 0.28);
  const offsetY = clientY - hostRect.top;
  if (offsetY <= edgeSize) return 'before';
  if (offsetY >= hostRect.height - edgeSize) return 'after';
  return canDropInside(targetElement) ? 'inside' : 'after';
}
