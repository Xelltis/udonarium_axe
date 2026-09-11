import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { DataElement, DataElementAttribute, DataElementRole } from '@axe/domain/data/data-element';

export const ELEMENT_TEMPLATES_NAME = 'elementTemplates';
const GATHERED_FIELDS_GROUP_NAME = '基本';

export interface ElementPlacement {
  parent: DataElement;
  element: DataElement;
}

export function findOwnerRootElement(element: DataElement): DataElement {
  let current = element;
  while (current.parent instanceof DataElement) current = current.parent;
  return current;
}

export function findElementTemplateOwner(element: DataElement): ObjectNode | null {
  const top = findOwnerRootElement(element);
  if (top.name === ELEMENT_TEMPLATES_NAME) return null;
  return top.parent;
}

export function findElementTemplateHolder(owner: ObjectNode): DataElement | null {
  for (const child of owner.children) {
    if (child instanceof DataElement && child.name === ELEMENT_TEMPLATES_NAME) return child;
  }
  return null;
}

export function readElementTemplates(owner: ObjectNode): DataElement[] {
  return [...(findElementTemplateHolder(owner)?.children ?? [])];
}

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

export function settleElementRole(element: DataElement): void {
  element.syncFieldRoleToHierarchy();
  if (element.fieldRole === DataElementRole.SECTION) gatherFieldsIntoGroup(element);
}

export function appendElementTemplateToSheet(detail: DataElement, template: DataElement): ElementPlacement | null {
  const element = buildElementTemplate(template, detail);
  if (!element) return null;
  detail.appendChild(element);
  settleElementRole(element);
  return { parent: detail, element };
}

export function duplicateDataElement(element: DataElement, parent: DataElement): DataElement | null {
  const copy = copyElementTree(element);
  if (!copy) return null;
  copy.name = DataElement.createUniqueSiblingName(parent, element.name);
  return copy;
}
