import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';

/**
 * What the section and the group at the foot of a sheet are called that hold the items a buff made
 * for itself, there being no such item on the sheet to move.
 */
export const BUFF_ITEMS_SECTION = 'バフの項目';

/** The mark an item a buff made carries, by which it is known to go once no buff needs it any more. */
const MADE_BY_BUFF = 'cs-buff-made';

/**
 * Makes an item at the foot of the sheet for a buff to move: a line of text holding the words, or a
 * number field holding the number, marked as made by a buff, in the group the section of such items
 * holds, which is made too where the sheet has none yet.
 */
export function makeBuffItem(detail: DataElement, name: string, value: string | number): DataElement {
  const group = buffItemsGroupOf(detail) ?? makeBuffItemsGroup(detail);
  const item = DataElement.create(name, value, {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]:
      typeof value === 'number' ? DataElementFieldType.NUMBER : DataElementFieldType.TEXT,
    [MADE_BY_BUFF]: '1',
  });
  group.appendChild(item);
  return item;
}

/** Whether a buff made the item for itself. */
export function isBuffMadeItem(item: DataElement): boolean {
  return item.getAttribute(MADE_BY_BUFF) === '1';
}

/**
 * Takes away an item a buff made, and the group and the section that held it once they hold
 * nothing else. An item a buff did not make is left where it is.
 */
export function dropBuffItem(item: DataElement): void {
  if (!isBuffMadeItem(item)) return;
  const group = item.parent;
  item.destroy();
  if (!(group instanceof DataElement) || group.children.length > 0) return;
  const section = group.parent;
  group.destroy();
  if (section instanceof DataElement && section.children.length < 1 && section.name === BUFF_ITEMS_SECTION) {
    section.destroy();
  }
}

function buffItemsGroupOf(detail: DataElement): DataElement | null {
  const section = detail.children.find((child) => child instanceof DataElement && child.name === BUFF_ITEMS_SECTION) as
    DataElement | undefined;
  return (section?.children.find((child) => child instanceof DataElement) as DataElement | undefined) ?? null;
}

function makeBuffItemsGroup(detail: DataElement): DataElement {
  const section =
    (detail.children.find((child) => child instanceof DataElement && child.name === BUFF_ITEMS_SECTION) as
      DataElement | undefined) ??
    DataElement.create(BUFF_ITEMS_SECTION, '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  if (!section.parent) detail.appendChild(section);
  const group = DataElement.create(BUFF_ITEMS_SECTION, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  section.appendChild(group);
  return group;
}
