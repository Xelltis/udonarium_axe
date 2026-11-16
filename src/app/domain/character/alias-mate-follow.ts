import { GameObject } from '@axe/core/sync/game-object';
import { heldWithinBounds, isChangeableElementType } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import type { ElementAliasTable } from '@axe/domain/data/element-alias';
import { findAliasMates } from '@axe/domain/data/element-reference';

/** The two places an item keeps what it holds: a resource's amount left, and its value or maximum. */
export type ElementValueField = 'currentValue' | 'value';

/** What a field of an item means to its mates: what it holds now, or the most it may hold. */
export type SharedSlot = 'now' | 'max';

/** Whether an item is one that gives its value to, and takes it from, the items under the same alias. */
export function takesSharedValue(element: DataElement): boolean {
  return isChangeableElementType(element.type) && element.fieldType !== DataElementFieldType.CALC;
}

/** What a field of an item means to its mates: what it holds now, or the most it may hold. */
function slotOf(element: DataElement, field: ElementValueField): SharedSlot | null {
  if (element.isNumberResource) return field === 'currentValue' ? 'now' : 'max';
  return field === 'value' ? 'now' : null;
}

/** Where an item keeps what it holds now, or the most it may hold; null for an item with no such place. */
export function sharedFieldOf(element: DataElement, slot: SharedSlot): ElementValueField | null {
  if (element.isNumberResource) return slot === 'now' ? 'currentValue' : 'value';
  return slot === 'now' ? 'value' : null;
}

/** A value as a mate takes it: a number held within the mate's own bounds, anything else as it is. */
export function heldForMate(mate: DataElement, field: ElementValueField, value: number | string): number | string {
  if (value === '' || value == null) return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  const held = heldWithinBounds(mate, field, number);
  return held === number ? value : held;
}

/**
 * Gives what an item now holds to the other items of its sheet under the same alias.
 *
 * What is left of a resource goes to what is left of its mates, its maximum to their maximums, and
 * the value of a plain field to what its mates hold now. A number is held within each mate's own
 * bounds, and a mate already holding the value is not written.
 *
 * This is called by the seat that made the edit, as part of the edit. Nothing calls it for a
 * change that arrives from another seat: that seat has already written the mates, and writing them
 * again here would have every seat answering every other.
 */
export function carryToAliasMates(element: DataElement, field: ElementValueField, aliases?: ElementAliasTable): void {
  if (!takesSharedValue(element)) return;
  const slot = slotOf(element, field);
  if (!slot) return;
  const value = element[field];

  for (const mate of findAliasMates(element, aliases)) {
    if (!takesSharedValue(mate)) continue;
    const mateField = sharedFieldOf(mate, slot);
    if (!mateField) continue;
    const held = heldForMate(mate, mateField, value);
    if (`${mate[mateField]}` !== `${held}`) mate[mateField] = held;
  }
}

/**
 * Writes a value an editor was given into an item, and carries it to the item's alias mates, as
 * one change.
 */
export function writeElementField(
  element: DataElement,
  field: ElementValueField,
  value: number | string,
  aliases?: ElementAliasTable
): void {
  GameObject.batch(() => {
    element[field] = value;
    carryToAliasMates(element, field, aliases);
  });
}
