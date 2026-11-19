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
 * number field holding the number, marked as made by a buff, in the group of the section such items
 * are kept in, which is made too where the sheet has none yet.
 */
export function makeBuffItem(detail: DataElement, name: string, value: string | number): DataElement {
  const section = buffItemsSectionOf(detail) ?? makeBuffItemsSection(detail);
  const group =
    (section.children.find((child) => child instanceof DataElement) as DataElement | undefined) ??
    makeBuffItemsGroup(section);
  const item = DataElement.create(name, value, {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]:
      typeof value === 'number' ? DataElementFieldType.NUMBER : DataElementFieldType.TEXT,
    [MADE_BY_BUFF]: '1',
  });
  group.appendChild(item);
  return item;
}

/** Whether the sheet keeps any item a buff made, which it does only in the section such items are kept in. */
export function keepsBuffItems(detail: DataElement): boolean {
  return buffItemsSectionOf(detail) !== null;
}

/**
 * Whether a buff made the item for itself and it is the buff's still: marked so, and kept where such
 * items are. One moved out of there has been taken into the sheet, and is the sheet's own.
 */
export function isBuffMadeItem(item: DataElement): boolean {
  if (item.getAttribute(MADE_BY_BUFF) !== '1') return false;
  const section = item.parent?.parent;
  return section instanceof DataElement && isBuffItemsSection(section);
}

/** The names of the items buffs made that the sheet keeps where such items are. */
export function buffItemNamesIn(detail: DataElement): string[] {
  const section = buffItemsSectionOf(detail);
  if (!section) return [];
  return section.children.flatMap((group) =>
    (group.children as DataElement[]).filter((item) => isBuffMadeItem(item)).map((item) => item.name)
  );
}

/**
 * Takes away an item a buff made, and the group and the section that held it once they hold nothing
 * else. Any other item is left where it is.
 */
export function dropBuffItem(item: DataElement): void {
  if (!isBuffMadeItem(item)) return;
  const group = item.parent as DataElement;
  const section = group.parent as DataElement;
  item.destroy();
  if (group.children.length > 0) return;
  group.destroy();
  if (section.children.length < 1) section.destroy();
}

/**
 * Takes away the section made items are kept in, and its groups, once they hold none: a section only
 * buffs make, left empty when its last item was moved out into the sheet.
 */
export function tidyBuffItems(detail: DataElement): void {
  const section = buffItemsSectionOf(detail);
  if (!section) return;
  for (const group of [...section.children]) if (group.children.length < 1) group.destroy();
  if (section.children.length < 1) section.destroy();
}

function isBuffItemsSection(element: DataElement): boolean {
  return (
    element.name === BUFF_ITEMS_SECTION && element.parent instanceof DataElement && element.parent.name === 'detail'
  );
}

function buffItemsSectionOf(detail: DataElement): DataElement | null {
  return (
    (detail.children.find((child) => child instanceof DataElement && isBuffItemsSection(child)) as DataElement) ?? null
  );
}

function makeBuffItemsSection(detail: DataElement): DataElement {
  const section = DataElement.create(BUFF_ITEMS_SECTION, '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  detail.appendChild(section);
  return section;
}

function makeBuffItemsGroup(section: DataElement): DataElement {
  const group = DataElement.create(BUFF_ITEMS_SECTION, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  section.appendChild(group);
  return group;
}
