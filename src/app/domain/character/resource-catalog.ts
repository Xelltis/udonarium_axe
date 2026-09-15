import { isInternalResource } from '@axe/domain/character/internal-resource';
import { isChangeableElementType } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementFieldType, DataElementRole, DataElementType } from '@axe/domain/data/data-element';
import { collectDataElements } from '@axe/domain/data/data-element-tree';

/**
 * What the pieces of a table are carrying, asked once and answered in one place.
 *
 * A screen that offers a status to work on and decides for itself what counts as one draws
 * the line somewhere of its own: the remote by what can be written to, the piece bars by what
 * holds a number, the lists by the names a room happens to list. A fix to one of them then
 * reaches none of the others.
 */

/** Something with a value and a maximum, and not one of the sheet's own workings. */
export function isResourceElement(element: DataElement): boolean {
  return element.isNumberResource && !isInternalResource(element);
}

/**
 * The same, as the sheet shows it.
 *
 * Data written before the field types carries none, and is read as a resource by the kind of
 * value it holds, so a sheet from an older room still offers what it always did.
 */
export function isResourceField(element: DataElement): boolean {
  return isResourceElement(element) && element.fieldType === DataElementFieldType.RESOURCE;
}

export interface ResourceElementOptions {
  /** Leave out a resource the sheet does not show as a resource field. */
  fieldsOnly?: boolean;
}

/** The resources one piece carries, in the order its sheet reads. */
export function resourceElementsOf(
  character: { detailDataElement: DataElement | null },
  options: ResourceElementOptions = {}
): DataElement[] {
  const keep = options.fieldsOnly === true ? isResourceField : isResourceElement;
  return collectDataElements(character.detailDataElement).filter(keep);
}

/** The names of the resources these pieces carry, in one sorted list to offer by name. */
export function resourceNamesOf(characters: readonly { detailDataElement: DataElement | null }[]): string[] {
  const names = new Set<string>();
  for (const character of characters) {
    for (const element of resourceElementsOf(character)) {
      const name = element.name.trim();
      if (name.length > 0) names.add(name);
    }
  }
  return [...names].sort();
}

export interface ResourceCatalogEntry {
  /** What the item is called, which is what an operation is written against. */
  name: string;
  /** Whether it keeps a maximum and bounds as well as a value, which is every slot rather than one. */
  isResource: boolean;
}

export interface ResourceCatalogOptions {
  /** Names to put at the head of the list, in this order. It leaves nothing out. */
  listFirst?: readonly string[];
}

/**
 * Everything that can be operated on across these pieces, in one list.
 *
 * An item is operated on by name, so the pieces being worked on are what decides it: one that
 * only somebody else carries is still theirs to move, and one written onto a sheet mid-session
 * is there as soon as it exists.
 *
 * A name the same sheet carries twice is left out. Nothing can say which of the two is meant,
 * so offering it would offer an operation that does nothing at all.
 */
export function resourceCatalogOf(
  characters: readonly { detailDataElement: DataElement | null }[],
  options: ResourceCatalogOptions = {}
): ResourceCatalogEntry[] {
  const found = new Map<string, boolean>();
  for (const character of characters) {
    for (const [name, isResource] of changeableNamesOf(character)) {
      found.set(name, (found.get(name) ?? false) || isResource);
    }
  }

  const head: string[] = [];
  for (const wanted of options.listFirst ?? []) {
    const name = wanted.trim();
    if (found.has(name) && !head.includes(name)) head.push(name);
  }
  const rest = [...found.keys()].filter((name) => !head.includes(name));

  return [...head, ...rest].map((name) => ({ name, isResource: found.get(name) === true }));
}

function changeableNamesOf(character: { detailDataElement: DataElement | null }): Map<string, boolean> {
  const detail = character.detailDataElement;
  const names = new Map<string, boolean>();
  if (!detail) return names;

  const timesNamed = new Map<string, number>();
  for (const element of collectDataElements(detail)) {
    const name = element.name.trim();
    timesNamed.set(name, (timesNamed.get(name) ?? 0) + 1);
    if (
      name.length > 0 &&
      element.fieldRole === DataElementRole.FIELD &&
      isChangeableElementType(element.type) &&
      !isInternalResource(element) &&
      !names.has(name)
    ) {
      names.set(name, element.type === DataElementType.NUMBER_RESOURCE);
    }
  }

  for (const name of [...names.keys()]) {
    if (timesNamed.get(name) !== 1) names.delete(name);
  }
  return names;
}
