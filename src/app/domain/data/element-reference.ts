import { DataElement } from '@axe/domain/data/data-element';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import {
  aliasMatesOf,
  aliasNamed,
  type ElementAliasTable,
  elementReferredTo,
  elementsReferredTo,
} from '@axe/domain/data/element-alias';

/**
 * The item of a sheet a reference is read from, the room's aliases counted.
 *
 * This is the one way a name written in a display item, a chat palette, a resource command or a
 * rule of the room finds its item, so all of them land on the same one. The aliases are the room's
 * own unless others are handed in.
 */
export function findReferencedElement(
  root: DataElement,
  reference: string,
  aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()
): DataElement | null {
  return elementReferredTo(root, reference, aliases);
}

/**
 * Every item of a sheet a value written under a reference goes to, the one it is read from first.
 *
 * A plain reference has one; an alias has every candidate found on the sheet.
 */
export function findReferencedElements(
  root: DataElement,
  reference: string,
  aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()
): DataElement[] {
  return elementsReferredTo(root, reference, aliases);
}

/**
 * Whether a name is one of the room's aliases, which is read from the items it stands for rather than
 * from an item of its own name.
 */
export function isAliasName(name: string, aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()): boolean {
  return aliasNamed(aliases, name) !== null;
}

/** The other items of the same sheet that take an item's value with it, by the room's aliases. */
export function findAliasMates(
  element: DataElement,
  aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()
): DataElement[] {
  return aliasMatesOf(element, aliases);
}
