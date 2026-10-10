import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  type DataElementFieldTypeValue,
  DataElementRole,
} from '@axe/domain/data/data-element';
import {
  buildElementTemplate,
  type ElementPlacement,
  settleElementRole,
} from '@axe/domain/data/data-element-templates';
import {
  canAcceptChildRole,
  canDropStructureElement,
  type DataElementDropPosition,
  getElementDepth,
  getSubtreeDepth,
  MAX_STANDARD_DEPTH,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-drop';

/**
 * Rearranges the items.
 *
 * Whether a drop is allowed is settled elsewhere; this only **moves and makes**.
 *
 * Something new is given a name no sibling has, since two of a name leave a palette or a
 * formula unable to say which it means. Moving touches no name — renamed under them, whoever
 * moved it would lose track of their own piece.
 */

/** The default name for something new. It follows the interface language, so the caller supplies it. */
export interface NewElementNames {
  field: string;
  group: string;
}

export interface StructureMove {
  newParent: DataElement;
  oldParent: DataElement | null;
}

/**
 * Moves what was picked up to where it was dropped.
 *
 * Null when it could not move; otherwise the parent that should hear about it.
 */
export function moveStructureElement(
  dragged: DataElement,
  target: DataElement,
  position: DataElementDropPosition
): StructureMove | null {
  const oldParent = dragged.parent instanceof DataElement ? dragged.parent : null;

  if (position === 'inside') {
    target.appendChild(dragged);
    finishMove(dragged);
    return { newParent: target, oldParent };
  }

  const parent = target.parent;
  if (!(parent instanceof DataElement)) return null;

  if (position === 'before') parent.insertBefore(dragged, target);
  else insertElementAfter(dragged, target, parent);

  finishMove(dragged);
  return { newParent: parent, oldParent };
}

/** It goes in front of the next sibling, or at the end when there is none. */
export function insertElementAfter(element: DataElement, target: DataElement, parent: DataElement): void {
  const index = parent.children.indexOf(target);
  const next = parent.children[index + 1];
  if (next) parent.insertBefore(element, next);
  else parent.appendChild(element);
}

/** Makes one item that holds a value, of the kind asked for, text unless told otherwise. */
export function createFieldElement(
  parent: DataElement,
  names: NewElementNames,
  reservedNames: Set<string> = new Set(),
  fieldType: DataElementFieldTypeValue = DataElementFieldType.TEXT
): DataElement {
  const uniqueName = DataElement.createUniqueSiblingName(parent, names.field, '', reservedNames);
  reservedNames.add(uniqueName);

  const element = DataElement.create(uniqueName, '', {
    [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT,
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
  });
  if (fieldType !== DataElementFieldType.TEXT) {
    element.setFieldType(fieldType);
    element.setAttribute('type', DataElement.dataTypeFromFieldType(fieldType));
  }
  return element;
}

/** A step an element can take among the ones beside it. */
export type SiblingMove = 'moveToTop' | 'moveUp' | 'moveDown' | 'moveToBottom';

/**
 * Where a step among its siblings takes an element: the sibling it lands beside, and on which side.
 * Null where there is no such sibling, as for a step up from the top.
 */
export function siblingMoveTarget(
  element: DataElement,
  move: SiblingMove
): { target: DataElement; position: 'before' | 'after' } | null {
  const parent = element.parent;
  if (!(parent instanceof DataElement)) return null;
  const siblings = parent.children.filter((child): child is DataElement => child instanceof DataElement);
  const index = siblings.indexOf(element);
  if (index < 0) return null;
  const [target, position]: [DataElement | undefined, 'before' | 'after'] =
    move === 'moveToTop'
      ? [siblings[0], 'before']
      : move === 'moveUp'
        ? [siblings[index - 1], 'before']
        : move === 'moveDown'
          ? [siblings[index + 1], 'after']
          : [siblings[siblings.length - 1], 'after'];
  if (!target || target === element) return null;
  return { target, position };
}

/** Takes a step among the element's siblings, where the structure allows it. Null when it did not move. */
export function moveAmongSiblings(element: DataElement, move: SiblingMove): StructureMove | null {
  const step = siblingMoveTarget(element, move);
  if (!step) return null;
  if (!canDropStructureElement(element, step.target, step.position, getElementDepth(step.target))) return null;
  return moveStructureElement(element, step.target, step.position);
}

/**
 * Makes one group to gather items into.
 *
 * An empty group gives the eye nothing to hold, so it comes back with one thing inside.
 */
export function createGroupElement(
  parent: DataElement,
  names: NewElementNames,
  reservedNames: Set<string> = new Set()
): DataElement {
  const uniqueName = DataElement.createUniqueSiblingName(parent, names.group, '', reservedNames);
  reservedNames.add(uniqueName);

  const container = DataElement.create(uniqueName, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  container.appendChild(createFieldElement(container, names));
  return container;
}

function finishMove(element: DataElement): void {
  element.syncFieldRoleToHierarchy();
  element.update();
}

function canHoldTemplate(target: DataElement, template: DataElement): boolean {
  if (target.name === 'detail') return true;
  return (
    canAcceptChildRole(target, DataElementRole.GROUP) &&
    getElementDepth(target) + 1 + getSubtreeDepth(template) <= MAX_STANDARD_DEPTH
  );
}

/**
 * Puts a copy of a saved template into the nearest element that can hold it, starting from the
 * container and climbing out through its parents.
 *
 * Once it has climbed out of an element the copy goes just after that element rather than at the
 * end of the parent, so it lands next to where it was asked for. Null when nothing up the line can
 * hold it or the template cannot be copied.
 */
export function placeElementTemplate(template: DataElement, container: DataElement): ElementPlacement | null {
  let anchor: DataElement | null = null;
  let target: DataElement | null = container;
  while (target) {
    if (canHoldTemplate(target, template)) {
      const element = buildElementTemplate(template, target);
      if (!element) return null;
      if (anchor) insertElementAfter(element, anchor, target);
      else target.appendChild(element);
      settleElementRole(element);
      return { parent: target, element };
    }
    anchor = target;
    target = target.parent instanceof DataElement ? target.parent : null;
  }
  return null;
}
