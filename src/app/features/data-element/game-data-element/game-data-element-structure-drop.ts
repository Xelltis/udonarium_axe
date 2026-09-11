import { DataElement, DataElementRole, type DataElementRoleValue } from '@axe/domain/data/data-element';
import { ELEMENT_TEMPLATES_NAME } from '@axe/domain/data/data-element-templates';

export type DataElementDropPosition = 'before' | 'after' | 'inside';

export const MAX_STANDARD_DEPTH = 3;

export function canDropInside(targetElement: DataElement): boolean {
  return targetElement.fieldRole !== DataElementRole.FIELD;
}

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

export function getElementDepth(element: DataElement): number {
  let depth = 0;
  let parent = element.parent;
  while (parent instanceof DataElement && parent.name !== 'detail' && parent.name !== ELEMENT_TEMPLATES_NAME) {
    depth++;
    parent = parent.parent;
  }
  return depth;
}

export function getSubtreeDepth(element: DataElement): number {
  let depth = 0;
  for (const child of element.children) {
    depth = Math.max(depth, getSubtreeDepth(child) + 1);
  }
  return depth;
}

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
