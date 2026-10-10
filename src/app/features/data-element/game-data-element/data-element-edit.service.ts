import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  type DataElementFieldTypeValue,
  DataElementRole,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import {
  duplicateDataElement,
  findElementTemplateHolder,
  findElementTemplateOwner,
  readElementTemplates,
  saveElementTemplate,
} from '@axe/domain/data/data-element-templates';
import { DataElementDeletionService } from '@axe/features/data-element/game-data-element/data-element-deletion.service';
import {
  canAcceptChildRole,
  canDropStructureElement,
  getElementDepth,
  listMoveTargets,
  type MoveTarget,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-drop';
import {
  createFieldElement,
  createGroupElement,
  insertElementAfter,
  moveAmongSiblings,
  moveStructureElement,
  type NewElementNames,
  placeElementTemplate,
  type SiblingMove,
  siblingMoveTarget,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-ops';

/** The attribute a group or section heading keeps its mark in. */
export const HEADING_ICON_ATTRIBUTE = 'cs-icon';

/** Why a new name was turned away, or that it was taken. */
export type RenameResult = 'renamed' | 'unchanged' | 'empty' | 'duplicate';

/**
 * What can be done to the shape of a sheet: renaming, changing a field's kind, adding, copying,
 * moving and deleting rows, groups and sections, and the templates a sheet keeps.
 *
 * The row's own buttons on a wide sheet and the editor a narrow sheet opens both come here, so a
 * change made either way is made the same way, and every change is announced to whatever draws the
 * elements it touched.
 */
@Injectable({ providedIn: 'root' })
export class DataElementEditService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly deletion = inject(DataElementDeletionService);

  /** The default names of something new, in the interface's language. */
  newElementNames(): NewElementNames {
    return {
      field: this.t('feature.dataElement.defaults.newTag'),
      group: this.t('feature.dataElement.defaults.newGroup'),
    };
  }

  /** The element holding this one, or null where it is held by something that is not an element. */
  parentOf(element: DataElement): DataElement | null {
    return element.parent instanceof DataElement ? element.parent : null;
  }

  /** The elements beside this one, itself among them, in order. */
  siblingsOf(element: DataElement): DataElement[] {
    const parent = this.parentOf(element);
    if (!parent) return [];
    return parent.children.filter((child): child is DataElement => child instanceof DataElement);
  }

  /** Tells whatever draws these elements that they changed. */
  notify(...elements: (DataElement | null | undefined)[]): void {
    const notified = new Set<string>();
    for (const element of elements) {
      if (!element || notified.has(element.identifier)) continue;
      element.update();
      this.objectChange.notifyChanged(element.identifier);
      notified.add(element.identifier);
    }
  }

  /**
   * Gives an element a new name. A name another sibling has is turned away, since two of a name
   * leave a palette or a formula unable to say which it means, and so is a blank one.
   */
  rename(element: DataElement, name: string): RenameResult {
    const next = name.trim();
    if (next === element.name) return 'unchanged';
    if (!next) return 'empty';
    if (this.hasSiblingNamed(element, next)) return 'duplicate';
    element.name = next;
    this.notify(element);
    return 'renamed';
  }

  /** Whether another element beside this one already has the name. */
  hasSiblingNamed(element: DataElement, name: string): boolean {
    const parent = this.parentOf(element);
    return !!parent && DataElement.hasSiblingName(parent, name.trim(), element.identifier);
  }

  /** Changes what kind of field an element is, keeping the older data type in step. */
  setFieldType(element: DataElement, fieldType: DataElementFieldTypeValue): void {
    element.setFieldType(fieldType);
    element.setAttribute('type', DataElement.dataTypeFromFieldType(fieldType));
    this.notify(element);
  }

  /** The mark a group or section heading wears; empty for none. */
  iconOf(element: DataElement): string {
    return String(element.getAttribute(HEADING_ICON_ATTRIBUTE) ?? '');
  }

  /** Gives a group or section heading a mark, or takes it away with the empty name. */
  setIcon(element: DataElement, icon: string): void {
    const name = icon.trim();
    if (name) element.setAttribute(HEADING_ICON_ATTRIBUTE, name);
    else element.removeAttribute(HEADING_ICON_ATTRIBUTE);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Whether an element is shown in its piece's popup. */
  isPopup(element: DataElement): boolean {
    return element.getAttribute(DataElementAttribute.POPUP) === 'true';
  }

  /** Shows an element in its piece's popup, or stops showing it there. */
  togglePopup(element: DataElement): void {
    if (this.isPopup(element)) element.removeAttribute(DataElementAttribute.POPUP);
    else element.setAttribute(DataElementAttribute.POPUP, 'true');
    this.objectChange.notifyChanged(element.identifier);
  }

  /**
   * Copies an element's path, as formulas and references write it, to the clipboard. Does nothing
   * where the element has no path or there is no clipboard.
   */
  copyReference(element: DataElement): void {
    const referencePath = DataElement.formatReferencePath(element);
    if (!referencePath) return;
    void navigator.clipboard?.writeText(referencePath);
  }

  /** Whether a new field may go in just after this element. */
  canAddFieldAfter(element: DataElement): boolean {
    const parent = this.parentOf(element);
    return !!parent && canAcceptChildRole(parent, DataElementRole.FIELD);
  }

  /** Adds a new field, of the kind asked for, just after this element. Null where it cannot go. */
  addFieldAfter(
    element: DataElement,
    fieldType: DataElementFieldTypeValue = DataElementFieldType.TEXT
  ): DataElement | null {
    const parent = this.parentOf(element);
    if (!parent || !this.canAddFieldAfter(element)) return null;
    const field = createFieldElement(parent, this.newElementNames(), new Set(), fieldType);
    insertElementAfter(field, element, parent);
    this.notify(parent, field);
    return field;
  }

  /** Whether a group or section may hold a new field. */
  canAddFieldInside(container: DataElement): boolean {
    return canAcceptChildRole(container, DataElementRole.FIELD);
  }

  /** Adds a new field, of the kind asked for, at the end of a group. Null where it cannot hold one. */
  addFieldInside(
    container: DataElement,
    fieldType: DataElementFieldTypeValue = DataElementFieldType.TEXT
  ): DataElement | null {
    if (!this.canAddFieldInside(container)) return null;
    const field = createFieldElement(container, this.newElementNames(), new Set(), fieldType);
    container.appendChild(field);
    this.notify(container, field);
    return field;
  }

  /** Whether a group or section may hold a new group. */
  canAddGroupInside(container: DataElement): boolean {
    return canAcceptChildRole(container, DataElementRole.GROUP);
  }

  /** Adds a new group, with one field already in it, at the end of a container. Null where it cannot hold one. */
  addGroupInside(container: DataElement): DataElement | null {
    if (!this.canAddGroupInside(container)) return null;
    const group = createGroupElement(container, this.newElementNames());
    container.appendChild(group);
    this.notify(container, group);
    return group;
  }

  /** Whether an element can be copied beside itself, which needs a parent to go into. */
  canDuplicate(element: DataElement): boolean {
    return this.parentOf(element) !== null;
  }

  /** Puts a copy of an element, with everything under it, just after it. Null where it cannot. */
  duplicate(element: DataElement): DataElement | null {
    const parent = this.parentOf(element);
    if (!parent) return null;
    const copy = duplicateDataElement(element, parent);
    if (!copy) return null;
    insertElementAfter(copy, element, parent);
    this.notify(parent, copy);
    return copy;
  }

  /**
   * Whether a group or section can be saved as a template, which needs it to be on the sheet of an
   * object that keeps templates, such as a character.
   */
  canSaveAsTemplate(element: DataElement): boolean {
    const role = element.fieldRole;
    if (role !== DataElementRole.GROUP && role !== DataElementRole.SECTION) return false;
    return findElementTemplateOwner(element) !== null;
  }

  /** Saves a copy of a group or section among the templates its sheet keeps. */
  saveAsTemplate(element: DataElement): void {
    if (!this.canSaveAsTemplate(element)) return;
    const owner = findElementTemplateOwner(element);
    if (!owner) return;
    const template = saveElementTemplate(owner, element);
    const holder = template?.parent;
    if (template && holder instanceof DataElement) this.notify(holder, template);
    this.objectChange.notifyChanged(owner.identifier);
  }

  /** The templates the sheet an element is on keeps, for a group or section; none for a field. */
  templatesFor(element: DataElement): DataElement[] {
    if (element.fieldRole === DataElementRole.FIELD) return [];
    const owner = findElementTemplateOwner(element);
    if (!owner) return [];
    this.objectChange.versionOf(owner.identifier)();
    const holder = findElementTemplateHolder(owner);
    if (holder) this.objectChange.versionOf(holder.identifier)();
    return readElementTemplates(owner);
  }

  /**
   * Puts a copy of a saved template into a container, or into the nearest parent that can hold it,
   * just after the branch it climbed out of. Null where nothing up the line can hold it.
   */
  insertTemplate(template: DataElement, container: DataElement): DataElement | null {
    const placed = placeElementTemplate(template, container);
    if (!placed) return null;
    this.notify(placed.parent, placed.element);
    return placed.element;
  }

  /** Deletes a saved template. */
  deleteTemplate(template: DataElement): void {
    const holder = this.parentOf(template);
    template.destroy();
    this.notify(holder);
  }

  /** Whether a step among its siblings would move the element. */
  canMove(element: DataElement, move: SiblingMove): boolean {
    return siblingMoveTarget(element, move) !== null;
  }

  /** Moves an element a step among its siblings, where the structure allows it. */
  move(element: DataElement, move: SiblingMove): void {
    const moved = moveAmongSiblings(element, move);
    if (moved) this.notify(moved.newParent, element, moved.oldParent);
  }

  /** Moves an element just before or just after another, where the structure allows it there. */
  moveBeside(element: DataElement, target: DataElement, side: 'before' | 'after'): void {
    if (!canDropStructureElement(element, target, side, getElementDepth(target))) return;
    const moved = moveStructureElement(element, target, side);
    if (moved) this.notify(moved.newParent, element, moved.oldParent);
  }

  /** The groups and sections an element could be moved into. */
  moveTargetsOf(element: DataElement): MoveTarget[] {
    return listMoveTargets(element);
  }

  /** Moves an element to the end of another group or section. */
  moveInto(element: DataElement, target: DataElement): void {
    const moved = moveStructureElement(element, target, 'inside');
    if (moved) this.notify(moved.newParent, element, moved.oldParent);
  }

  /** Whether a group or section is set to show as a table. */
  isTableView(element: DataElement): boolean {
    return element.viewMode === DataElementViewMode.TABLE;
  }

  /** Switches a group or section between showing as a table and showing as rows. */
  toggleTableView(element: DataElement): void {
    if (element.fieldRole === DataElementRole.FIELD) return;
    element.setViewMode(this.isTableView(element) ? DataElementViewMode.NORMAL : DataElementViewMode.TABLE);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Deletes an element and everything under it, leaving a notice that offers to put it back. */
  delete(element: DataElement, onRestored?: (restored: DataElement) => void): void {
    this.deletion.delete(element, onRestored);
  }
}
