import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { DataElement, DataElementAttribute, DataElementRole } from '@axe/domain/data/data-element';

export const ELEMENT_TEMPLATES_NAME = 'elementTemplates';
const GATHERED_FIELDS_GROUP_NAME = '基本';

export interface ElementPlacement {
  parent: DataElement;
  element: DataElement;
}

/** The outermost data element above this one, such as a character's detail sheet; the element itself at the top. */
export function findOwnerRootElement(element: DataElement): DataElement {
  let current = element;
  while (current.parent instanceof DataElement) current = current.parent;
  return current;
}

/**
 * The object, such as a character, whose sheet holds this element and so keeps its saved templates.
 *
 * Null for an element inside a saved template, which is why a template cannot be saved from a template.
 */
export function findElementTemplateOwner(element: DataElement): ObjectNode | null {
  const top = findOwnerRootElement(element);
  if (top.name === ELEMENT_TEMPLATES_NAME) return null;
  return top.parent;
}

/** The element holding an object's saved templates, or null when nothing has been saved on it yet. */
export function findElementTemplateHolder(owner: ObjectNode): DataElement | null {
  for (const child of owner.children) {
    if (child instanceof DataElement && child.name === ELEMENT_TEMPLATES_NAME) return child;
  }
  return null;
}

/** The templates saved on an object, in the order they were saved; empty when there are none. */
export function readElementTemplates(owner: ObjectNode): DataElement[] {
  return [...(findElementTemplateHolder(owner)?.children ?? [])];
}

/** An object's top-level data elements that make up its sheet, leaving out the saved-template holder. */
export function sheetElementsOf(owner: ObjectNode): DataElement[] {
  return owner.children.filter(
    (child): child is DataElement => child instanceof DataElement && child.name !== ELEMENT_TEMPLATES_NAME
  );
}

function copyElementTree(element: DataElement): DataElement | null {
  const parsed = ObjectSerializer.instance.parseXml(element.toXml());
  if (parsed instanceof DataElement) return parsed;
  parsed?.destroy();
  return null;
}

/**
 * Saves a copy of an element and everything under it as a template on the object, and returns the copy.
 *
 * The holder is created on the first save, and the copy is renamed if another template already has its
 * name. Both are synced to the other peers. Returns null when the element could not be copied.
 */
export function saveElementTemplate(owner: ObjectNode, element: DataElement): DataElement | null {
  let holder = findElementTemplateHolder(owner);
  if (!holder) {
    holder = DataElement.create(ELEMENT_TEMPLATES_NAME, '', {}, `${ELEMENT_TEMPLATES_NAME}_${owner.identifier}`);
    owner.appendChild(holder);
  }
  const template = copyElementTree(element);
  if (!template) return null;
  template.name = DataElement.createUniqueSiblingName(holder, element.name);
  holder.appendChild(template);
  return template;
}

/**
 * A copy of a saved template, named so it does not clash with the children of the parent it is meant for.
 *
 * The copy is not added anywhere; the caller places it. Returns null when the template could not be copied.
 */
export function buildElementTemplate(template: DataElement, parent: DataElement): DataElement | null {
  const element = copyElementTree(template);
  if (!element) return null;
  element.name = DataElement.createUniqueSiblingName(parent, template.name);
  return element;
}

function gatherFieldsIntoGroup(section: DataElement): void {
  const fields = section.children.filter((child) => child.fieldRole === DataElementRole.FIELD);
  if (fields.length < 1) return;
  const group = DataElement.create(GATHERED_FIELDS_GROUP_NAME, '', {
    [DataElementAttribute.ROLE]: DataElementRole.GROUP,
  });
  section.insertBefore(group, fields[0]);
  for (const field of fields) group.appendChild(field);
}

/**
 * Fixes an element's section, group or field role to match where it now sits on the sheet.
 *
 * An element that becomes a section has its loose fields gathered into a new group, since a section lists
 * groups rather than fields.
 */
export function settleElementRole(element: DataElement): void {
  element.syncFieldRoleToHierarchy();
  if (element.fieldRole === DataElementRole.SECTION) gatherFieldsIntoGroup(element);
}

/** Adds a copy of a template to the end of a sheet's detail element with its role settled, or null if it cannot. */
export function appendElementTemplateToSheet(detail: DataElement, template: DataElement): ElementPlacement | null {
  const element = buildElementTemplate(template, detail);
  if (!element) return null;
  detail.appendChild(element);
  settleElementRole(element);
  return { parent: detail, element };
}

/**
 * A copy of an element and everything under it, named so it does not clash with the parent's children.
 *
 * The copy is not added anywhere; the caller places it. Returns null when the element could not be copied.
 */
export function duplicateDataElement(element: DataElement, parent: DataElement): DataElement | null {
  const copy = copyElementTree(element);
  if (!copy) return null;
  copy.name = DataElement.createUniqueSiblingName(parent, element.name);
  return copy;
}
