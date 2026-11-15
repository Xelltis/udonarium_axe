import { GameObject } from '@axe/core/sync/game-object';
import { toHalfWidth } from '@axe/core/util/string-util';
import { heldForMate, sharedFieldOf, type SharedSlot, takesSharedValue } from '@axe/domain/character/alias-mate-follow';
import { GameCharacter } from '@axe/domain/character/game-character';
import { heldWithinBounds, StatusAccessor } from '@axe/domain/character/status-accessor';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementType,
} from '@axe/domain/data/data-element';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { aliasTargetsOn, type ElementAliasTable } from '@axe/domain/data/element-alias';
import { findReferencedElements } from '@axe/domain/data/element-reference';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';

/**
 * The parts of an item that may keep a default, the value each goes back to: what it holds now, the
 * maximum it stands at, and the corrections on top of its maximum and its minimum.
 */
export type DefaultSlot = 'now' | 'max' | 'maxCorrection' | 'minCorrection';

/** Where on an item a value put back is kept. */
export type DefaultField = 'value' | 'currentValue' | 'maxCorrection' | 'minCorrection';

/** The order the slots of one item are put back in: the bounds first, the maximum, then what it holds. */
const DEFAULT_SLOTS: readonly DefaultSlot[] = ['minCorrection', 'maxCorrection', 'max', 'now'];

const ATTRIBUTE_OF_SLOT: Record<DefaultSlot, string> = {
  now: DataElementAttribute.DEFAULT,
  max: DataElementAttribute.DEFAULT_MAX,
  maxCorrection: DataElementAttribute.DEFAULT_MAX_CORRECTION,
  minCorrection: DataElementAttribute.DEFAULT_MIN_CORRECTION,
};

const RESOURCE_SLOTS: readonly DefaultSlot[] = ['now', 'max', 'maxCorrection', 'minCorrection'];
const VALUE_SLOTS: readonly DefaultSlot[] = ['now'];
const NO_SLOTS: readonly DefaultSlot[] = [];

/** Which items a putting back takes: every one of a sheet, or the one a name stands for, at one slot. */
export type DefaultPick =
  { readonly kind: 'all' } | { readonly kind: 'item'; readonly name: string; readonly slot: ResourceSlot };

/** Every item of a sheet. */
export const EVERY_DEFAULT: DefaultPick = Object.freeze({ kind: 'all' });

/** One place on one item that a putting back changed, with what it held before and holds after. */
export interface DefaultValueChange {
  /** The identifier of the item. */
  readonly identifier: string;
  readonly name: string;
  readonly slot: DefaultSlot;
  readonly field: DefaultField;
  readonly before: number | string;
  readonly after: number | string;
  /** Whether the item kept no default of its own and took the value of an alias mate that does. */
  readonly followed: boolean;
}

/** What putting one piece back to its defaults came to. */
export interface PieceDefaultReset {
  readonly piece: GameCharacter;
  /** Whether the sheet has the item named; always so where every item was asked for. */
  readonly found: boolean;
  /** How many defaults were found among what was asked for, changed or not. */
  readonly defaults: number;
  readonly changes: readonly DefaultValueChange[];
}

function isTableCell(element: DataElement): boolean {
  if (element.getAttribute(DataElementAttribute.CELL_KIND) !== '') return true;
  for (let parent = element.parent; parent instanceof DataElement; parent = parent.parent) {
    if (parent.type === DataElementType.CHECK_TABLE || parent.fieldType === DataElementFieldType.CHECK_TABLE) {
      return true;
    }
  }
  return false;
}

/**
 * The slots of an item that may keep a default: all four for a resource, one that may go over its
 * maximum among them, and what it holds for a number and a checkbox. None for text, a choice, a
 * calculation, a picture or a table and its cells, whose default an empty text could not be told from
 * having none.
 */
export function defaultSlotsOf(element: DataElement): readonly DefaultSlot[] {
  const fieldType = element.fieldType;
  if (fieldType === DataElementFieldType.RESOURCE) {
    return element.isNumberResource && !isTableCell(element) ? RESOURCE_SLOTS : NO_SLOTS;
  }
  if (fieldType === DataElementFieldType.NUMBER) {
    return element.type === DataElementType.TEXT && !isTableCell(element) ? VALUE_SLOTS : NO_SLOTS;
  }
  if (fieldType === DataElementFieldType.CHECK) return isTableCell(element) ? NO_SLOTS : VALUE_SLOTS;
  return NO_SLOTS;
}

function numberIn(raw: unknown): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/**
 * The default an item keeps for a slot, or null where it keeps none.
 *
 * A missing attribute, an empty or blank one and one that is no number all read as none, never as 0;
 * `0` is a default of 0. A checkbox keeps `0` or `1` and nothing else. An attribute left on an item
 * of a kind that may keep no default is not read.
 */
export function readDefault(element: DataElement, slot: DefaultSlot): number | null {
  if (!defaultSlotsOf(element).includes(slot)) return null;
  const number = numberIn(element.getAttribute(ATTRIBUTE_OF_SLOT[slot]));
  if (number == null) return null;
  if (element.fieldType === DataElementFieldType.CHECK) return number === 0 || number === 1 ? number : null;
  return number;
}

/** Whether an item keeps a default for any of its slots. */
export function hasDefault(element: DataElement): boolean {
  return defaultSlotsOf(element).some((slot) => readDefault(element, slot) != null);
}

/**
 * Gives an item a default for a slot. False, writing nothing, where the item may keep none there or
 * the value is no number. A checkbox keeps 1 for any value but 0.
 */
export function writeDefault(element: DataElement, slot: DefaultSlot, value: number): boolean {
  if (!defaultSlotsOf(element).includes(slot) || !Number.isFinite(value)) return false;
  const kept = element.fieldType === DataElementFieldType.CHECK ? (value === 0 ? 0 : 1) : value;
  if (String(element.getAttribute(ATTRIBUTE_OF_SLOT[slot])) !== String(kept)) {
    element.setAttribute(ATTRIBUTE_OF_SLOT[slot], String(kept));
  }
  return true;
}

/** Whether an item carries anything under the attribute of a slot, readable as a default or not. */
function isWritten(element: DataElement, slot: DefaultSlot): boolean {
  return `${element.getAttribute(ATTRIBUTE_OF_SLOT[slot])}` !== '';
}

/** Takes the default for a slot off an item, whatever kind of item it is. */
export function clearDefault(element: DataElement, slot: DefaultSlot): void {
  if (isWritten(element, slot)) element.removeAttribute(ATTRIBUTE_OF_SLOT[slot]);
}

/** Every item below a sheet's root, in the order of the sheet. */
function itemsBelow(root: DataElement | null | undefined): DataElement[] {
  const items: DataElement[] = [];
  const walk = (element: DataElement) => {
    for (const child of element.children) {
      items.push(child);
      walk(child);
    }
  };
  if (root) walk(root);
  return items;
}

function sheetsOf(piece: GameCharacter): GameCharacter[] {
  return [piece, ...piece.partsAlong()];
}

function writeOrClear(element: DataElement, slot: DefaultSlot, value: number | null): void {
  if (value == null) clearDefault(element, slot);
  else writeDefault(element, slot, value);
}

function captureItem(element: DataElement): boolean {
  const slots = defaultSlotsOf(element);
  if (slots.length < 1) return false;
  if (element.fieldType === DataElementFieldType.CHECK) {
    writeDefault(element, 'now', element.isChecked ? 1 : 0);
  } else if (element.isNumberResource) {
    writeOrClear(element, 'now', numberIn(element.currentValue));
    writeOrClear(element, 'max', numberIn(element.value));
    writeDefault(element, 'maxCorrection', element.maxCorrection);
    writeDefault(element, 'minCorrection', element.minCorrection);
  } else {
    writeOrClear(element, 'now', numberIn(element.value));
  }
  return hasDefault(element);
}

/**
 * Makes what a piece and the parts that go with it hold now their defaults, and answers how many
 * items came to keep one.
 *
 * Every number, checkbox and resource is written: a resource its amount left, its maximum and both
 * corrections, a correction it has none of as 0. A value that is empty or no number leaves that slot
 * without a default, taking away one it had. Items of any other kind are left alone.
 */
export function captureDefaults(piece: GameCharacter): number {
  return GameObject.batch(() => {
    let kept = 0;
    for (const sheet of sheetsOf(piece)) {
      for (const element of itemsBelow(sheet.detailDataElement)) {
        if (captureItem(element)) kept += 1;
      }
    }
    return kept;
  });
}

/**
 * Takes every default off a piece and the parts that go with it, off items of a kind that may keep
 * none as well, and answers how many items had one written.
 */
export function clearDefaults(piece: GameCharacter): number {
  return GameObject.batch(() => {
    let cleared = 0;
    for (const sheet of sheetsOf(piece)) {
      for (const element of itemsBelow(sheet.detailDataElement)) {
        const written = DEFAULT_SLOTS.filter((slot) => isWritten(element, slot));
        if (written.length < 1) continue;
        for (const slot of written) clearDefault(element, slot);
        cleared += 1;
      }
    }
    return cleared;
  });
}

interface PickedItem {
  readonly element: DataElement;
  readonly slots: readonly DefaultSlot[];
}

function asDefaultSlot(slot: ResourceSlot): DefaultSlot | null {
  return slot === 'now' || slot === 'max' || slot === 'maxCorrection' || slot === 'minCorrection' ? slot : null;
}

/** The items of one sheet a pick takes, with the slots asked of each, and whether the name was found. */
function pickedOn(
  root: DataElement | null | undefined,
  pick: DefaultPick,
  aliases: ElementAliasTable
): { found: boolean; items: PickedItem[] } {
  if (!root) return { found: pick.kind === 'all', items: [] };
  if (pick.kind === 'all') {
    return { found: true, items: itemsBelow(root).map((element) => ({ element, slots: defaultSlotsOf(element) })) };
  }
  let named = findReferencedElements(root, pick.name, aliases);
  if (named.length < 1) named = findReferencedElements(root, toHalfWidth(pick.name), aliases);
  const slot = asDefaultSlot(pick.slot);
  return {
    found: named.length > 0,
    items: named.map((element) => ({
      element,
      slots: slot && defaultSlotsOf(element).includes(slot) ? [slot] : NO_SLOTS,
    })),
  };
}

interface FieldsHeld {
  readonly minCorrection: number;
  readonly maxCorrection: number;
  readonly value: number | string;
  readonly currentValue: number | string;
}

const FIELDS_IN_ORDER: readonly DefaultField[] = ['minCorrection', 'maxCorrection', 'value', 'currentValue'];

function fieldsHeldBy(element: DataElement): FieldsHeld {
  return {
    minCorrection: element.minCorrection,
    maxCorrection: element.maxCorrection,
    value: element.value,
    currentValue: element.currentValue,
  };
}

function slotOfField(element: DataElement, field: DefaultField): DefaultSlot {
  if (field === 'minCorrection' || field === 'maxCorrection') return field;
  if (field === 'currentValue') return 'now';
  return element.isNumberResource ? 'max' : 'now';
}

function changesBetween(
  element: DataElement,
  before: FieldsHeld,
  after: FieldsHeld,
  followed: boolean
): DefaultValueChange[] {
  const changes: DefaultValueChange[] = [];
  for (const field of FIELDS_IN_ORDER) {
    if (`${before[field] ?? ''}` === `${after[field] ?? ''}`) continue;
    changes.push({
      identifier: element.identifier,
      name: element.name,
      slot: slotOfField(element, field),
      field,
      before: before[field] ?? '',
      after: after[field] ?? '',
      followed,
    });
  }
  return changes;
}

function holds(raw: number | string, value: number): boolean {
  return numberIn(raw) === value;
}

/** Puts one slot of an item at a value, held within the item's bounds, writing nothing it already holds. */
function putBack(element: DataElement, slot: DefaultSlot, value: number): void {
  if (slot === 'maxCorrection' || slot === 'minCorrection') {
    if (element[slot] !== value) StatusAccessor.writeSlot(element, slot, value);
    return;
  }
  if (element.fieldType === DataElementFieldType.CHECK) {
    if (element.isChecked !== (value !== 0)) element.value = value;
    return;
  }
  const field = element.isNumberResource && slot === 'now' ? 'currentValue' : 'value';
  const held = heldWithinBounds(element, field, value);
  if (!holds(element[field], held)) element[field] = held;
}

/**
 * Gives the items that keep no default the value of an alias mate that was put back: of each alias,
 * in the order the room lists them, the first item put back gives what it now holds to every other
 * item under the alias that keeps no default for the same slot, each within its own bounds. An item
 * takes a value once, from the first alias that has one for it, so the result is the same whatever
 * order the items were put back in.
 */
function followMates(
  root: DataElement,
  putBackAt: Record<SharedSlot, Set<DataElement>>,
  aliases: ElementAliasTable
): DefaultValueChange[] {
  const changes: DefaultValueChange[] = [];
  const taken: Record<SharedSlot, Set<DataElement>> = { max: new Set(), now: new Set() };
  for (const alias of aliases) {
    const targets = aliasTargetsOn(root, alias).filter((target) => takesSharedValue(target));
    for (const slot of ['max', 'now'] as const) {
      const source = targets.find((target) => putBackAt[slot].has(target));
      const sourceField = source ? sharedFieldOf(source, slot) : null;
      if (!source || !sourceField) continue;
      for (const mate of targets) {
        if (mate === source || taken[slot].has(mate) || readDefault(mate, slot) != null) continue;
        const field = sharedFieldOf(mate, slot);
        if (!field) continue;
        taken[slot].add(mate);
        const held = heldForMate(mate, field, source[sourceField]);
        if (`${mate[field]}` === `${held}`) continue;
        const before = fieldsHeldBy(mate);
        mate[field] = held;
        changes.push(...changesBetween(mate, before, fieldsHeldBy(mate), true));
      }
    }
  }
  return changes;
}

/**
 * Puts one piece back to its defaults, its parts left alone, and answers what changed.
 *
 * Only an item that keeps a default is written, and only the slots it keeps one for: the corrections
 * first, then the maximum, then what it holds, each held within the item's bounds. Once every such
 * item is written, the items that share an alias with one of them and keep no default of their own
 * are given its value. An item without a default and without such a mate is never touched.
 */
export function resetPieceToDefaults(
  piece: GameCharacter,
  pick: DefaultPick = EVERY_DEFAULT,
  aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()
): PieceDefaultReset {
  const root = piece.detailDataElement;
  const { found, items } = pickedOn(root, pick, aliases);
  return GameObject.batch(() => {
    let defaults = 0;
    const changes: DefaultValueChange[] = [];
    const putBackAt: Record<SharedSlot, Set<DataElement>> = { max: new Set(), now: new Set() };
    for (const { element, slots } of items) {
      const before = fieldsHeldBy(element);
      for (const slot of DEFAULT_SLOTS) {
        const value = slots.includes(slot) ? readDefault(element, slot) : null;
        if (value == null) continue;
        defaults += 1;
        putBack(element, slot, value);
        if (slot === 'max' || slot === 'now') putBackAt[slot].add(element);
      }
      changes.push(...changesBetween(element, before, fieldsHeldBy(element), false));
    }
    if (root && defaults > 0) changes.push(...followMates(root, putBackAt, aliases));
    return { piece, found, defaults, changes };
  });
}

/**
 * Puts a piece and the parts that go with it back to their defaults, the piece first, and answers
 * what changed on each; see {@link resetPieceToDefaults}. A part is put back on its own.
 */
export function resetToDefaults(
  piece: GameCharacter,
  pick: DefaultPick = EVERY_DEFAULT,
  aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()
): PieceDefaultReset[] {
  return GameObject.batch(() => sheetsOf(piece).map((sheet) => resetPieceToDefaults(sheet, pick, aliases)));
}

/** Whether a piece, or a part that goes with it, has an item a name stands for, of whatever kind. */
export function holdsItemNamed(
  piece: GameCharacter,
  name: string,
  aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()
): boolean {
  return sheetsOf(piece).some(
    (sheet) => pickedOn(sheet.detailDataElement, { kind: 'item', name, slot: 'now' }, aliases).found
  );
}

/**
 * How many defaults a putting back would find on a piece and the parts that go with it, writing
 * nothing; for the one item named, where a pick names one.
 */
export function countDefaults(
  piece: GameCharacter,
  pick: DefaultPick = EVERY_DEFAULT,
  aliases: ElementAliasTable = DataSummarySetting.aliasesInRoom()
): number {
  let defaults = 0;
  for (const sheet of sheetsOf(piece)) {
    for (const { element, slots } of pickedOn(sheet.detailDataElement, pick, aliases).items) {
      defaults += slots.filter((slot) => readDefault(element, slot) != null).length;
    }
  }
  return defaults;
}
