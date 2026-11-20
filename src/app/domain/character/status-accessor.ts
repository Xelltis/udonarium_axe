import { GameObject } from '@axe/core/sync/game-object';
import { toHalfWidth } from '@axe/core/util/string-util';
import { heldTextOf, isNotedByBuffs, isWrittenOtherwise, noteLeftByBuffs } from '@axe/domain/character/buff-layers';
import {
  buffItemsIn,
  dropBuffItem,
  isBuffMadeItem,
  keepsBuffItems,
  makeBuffItem,
  tidyBuffItems,
} from '@axe/domain/character/buff-made-items';
import {
  type BuffTarget,
  type ItemLanding,
  type ItemsLandedOn,
  type ItemTakes,
  landingOn,
  type WrittenAs,
} from '@axe/domain/character/item-landing';
import { allowsOverResource } from '@axe/domain/character/over-resource';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  type DataElementFieldTypeValue,
  DataElementType,
} from '@axe/domain/data/data-element';
import type { ElementAliasTable } from '@axe/domain/data/element-alias';
import { findReferencedElements, isAliasName } from '@axe/domain/data/element-reference';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';
import { parseSelectChoices } from '@axe/domain/data/select-choices';

type SlotType = 'value' | 'currentValue' | 'maxBase' | 'maxCorrection' | 'minBase' | 'minCorrection';

/** Where on the element each slot of a resource is kept. */
const STORAGE_OF_SLOT: Record<ResourceSlot, SlotType> = {
  now: 'currentValue',
  max: 'value',
  maxBase: 'maxBase',
  maxCorrection: 'maxCorrection',
  minBase: 'minBase',
  minCorrection: 'minCorrection',
};

const SLOT_ATTRIBUTE: Partial<Record<SlotType, string>> = {
  maxBase: DataElementAttribute.MAX_BASE,
  maxCorrection: DataElementAttribute.MAX_CORRECTION,
  minBase: DataElementAttribute.MIN_BASE,
  minCorrection: DataElementAttribute.MIN_CORRECTION,
};

/** The kinds of field on a line of text that hold words rather than a number; a select is told apart before. */
/**
 * What an item of a sheet takes written into it, by how its field is edited and shown: words for a
 * line of text, prose, a range's shape or an effect's name; one of its choices for a select; numbers
 * for a number, a resource or a sum worked out; and nothing for a check box, a picture or a table.
 * Every kind of field is named here, so one added later is told what it takes.
 */
const FIELD_TAKES: Readonly<Record<DataElementFieldTypeValue, 'words' | 'choice' | 'numbers' | 'nothing'>> = {
  [DataElementFieldType.TEXT]: 'words',
  [DataElementFieldType.LONG_TEXT]: 'words',
  [DataElementFieldType.MARKDOWN]: 'words',
  [DataElementFieldType.RANGE_SHAPE]: 'words',
  [DataElementFieldType.EFFECT]: 'words',
  [DataElementFieldType.SELECT]: 'choice',
  [DataElementFieldType.NUMBER]: 'numbers',
  [DataElementFieldType.RESOURCE]: 'numbers',
  [DataElementFieldType.CALC]: 'numbers',
  [DataElementFieldType.CHECK]: 'nothing',
  [DataElementFieldType.IMAGE]: 'nothing',
  [DataElementFieldType.CHECK_TABLE]: 'nothing',
};

const CHANGEABLE_TYPES: ReadonlySet<string> = new Set([
  DataElementType.NUMBER_RESOURCE,
  DataElementType.TEXT,
  DataElementType.NOTE,
]);

/** Whether an item of this kind is one a number or a line of text can be written to. */
export function isChangeableElementType(type: string): boolean {
  return CHANGEABLE_TYPES.has(type);
}

/** The whole number a value or current value holds, or null when it is empty or not a number. */
function integerHeldIn(raw: number | string): number | null {
  const number = parseInt(raw as string);
  return Number.isFinite(number) ? number : null;
}

/** The number a value or current value holds, or null when it is empty or not a number. */
function numberHeldIn(raw: number | string): number | null {
  if (raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

/** Where on an item a slot of its value is kept, or null when the item has no such slot. */
function storageOf(data: DataElement, slot: ResourceSlot): SlotType | null {
  if (data.type === DataElementType.NUMBER_RESOURCE) return STORAGE_OF_SLOT[slot];
  if (data.type === DataElementType.TEXT) return slot === 'now' ? 'value' : null;
  return null;
}

/**
 * Resource fields have a 3-layer constraint built from the effective min/max
 * (= base + correction) configured on the element:
 *   currentValue ∈ [effectiveMin, value (currentMax)]
 *   value (currentMax) ∈ [effectiveMin, effectiveMax]
 * `null` from getters means unbounded on that side, as is a current maximum that is empty or not
 * a number. A resource set to go over its maximum has no upper bound on its current value.
 */
export function heldWithinBounds(data: DataElement, type: 'value' | 'currentValue', input: number): number {
  if (!Number.isFinite(input)) return input;
  let result = input;
  const effectiveMin = data.effectiveMin;
  if (effectiveMin != null) result = Math.max(effectiveMin, result);
  let upper: number | null = null;
  if (type === 'currentValue') {
    const currentMax = numberHeldIn(data.value);
    if (currentMax != null && !allowsOverResource(data)) upper = currentMax;
  } else {
    upper = data.effectiveMax;
  }
  if (upper != null) result = Math.min(upper, result);
  return result;
}

/**
 * Reads and writes a piece's sheet by the names chat commands and the room's rules use.
 *
 * A name is looked up with the room's aliases counted. It is read from the first item an alias
 * stands for on this sheet, and a value written under it goes to every one of them: the first is
 * written, and the others are given what the first came to hold, each within its own bounds.
 */
export class StatusAccessor implements ItemsLandedOn {
  /**
   * @param detailElement The piece's sheet, or how to read it as it stands each time: a piece's own
   *   accessor is kept, and reads the sheet the piece holds now.
   */
  constructor(
    private readonly detailElement: DataElement | null | (() => DataElement | null),
    private readonly characterName: () => string,
    /** The aliases a name is looked up with; the room's own where none are handed in. */
    private readonly aliases?: () => ElementAliasTable
  ) {}

  /** The piece's sheet as it stands. */
  private get detailDataElement(): DataElement | null {
    return typeof this.detailElement === 'function' ? this.detailElement() : this.detailElement;
  }

  /**
   * Whether the sheet item a chat command names exists and is of a kind it can write to: a
   * resource, a line of text or a note.
   */
  canChangeName(name: string): boolean {
    const data = this.findData(name);
    if (!data) return false;
    return isChangeableElementType(data.type);
  }

  /** A resource answers to every slot; anything else has only the one value to write to. */
  canChange(name: string, nowOrMax: ResourceSlot): boolean {
    const data = this.findData(name);
    if (!data) return false;
    if (data.type === DataElementType.NUMBER_RESOURCE) return true;
    if (data.type === DataElementType.TEXT || data.type === DataElementType.NOTE) return nowOrMax === 'now';
    return false;
  }

  /**
   * Where on the item a slot of its value is kept, or null when the item has no such slot.
   *
   * A resource answers every slot, a text item only `now`, which is its value, and a note or
   * anything else none.
   */
  getType(name: string, nowOrMax: ResourceSlot): string | null {
    const data = this.findData(name);
    return data ? storageOf(data, nowOrMax) : null;
  }

  /**
   * Where text written to the item goes: a resource keeps it in its current value, anything else in
   * its value. Null when there is no such item.
   */
  getTextType(name: string): string | null {
    const data = this.findData(name);
    if (!data) return null;
    return data.type === DataElementType.NUMBER_RESOURCE ? 'currentValue' : 'value';
  }

  /**
   * The number held in a slot of the item, or null when there is no such item or slot. The value
   * and current value are read as integers, null when empty or not a number, and an unset base
   * reads as 0.
   */
  getValue(name: string, nowOrMax: ResourceSlot): number | null {
    const data = this.findData(name);
    return data ? StatusAccessor.readSlot(data, nowOrMax) : null;
  }

  private static readSlot(data: DataElement, slot: ResourceSlot): number | null {
    const type = storageOf(data, slot);
    if (type == null) return null;
    if (type === 'value') return integerHeldIn(data.value);
    if (type === 'currentValue') return integerHeldIn(data.currentValue);
    if (type === 'maxBase') return data.maxBase ?? 0;
    if (type === 'maxCorrection') return data.maxCorrection;
    if (type === 'minBase') return data.minBase ?? 0;
    if (type === 'minCorrection') return data.minCorrection;
    return null;
  }

  /**
   * Writes a number into a slot of the item, held within the item's bounds. False when there is no
   * such item or slot.
   *
   * Writing a base or a correction moves the effective limits, so a maximum-side change carries the
   * maximum to the new effective maximum, and both the maximum and the current value are pulled
   * back inside the new bounds. A correction of 0 is removed rather than stored.
   */
  setValue(name: string, nowOrMax: ResourceSlot, setValue: number): boolean {
    return StatusAccessor.writeFound(this.findAll(name), nowOrMax, setValue);
  }

  /** Writes a number into a slot of the items a name found, as {@link setValue} does. */
  private static writeFound(found: readonly DataElement[], nowOrMax: ResourceSlot, setValue: number): boolean {
    const [first, ...mates] = found;
    if (!first) return false;
    return GameObject.batch(() => {
      if (!StatusAccessor.writeSlot(first, nowOrMax, setValue)) return false;
      const storage = storageOf(first, nowOrMax);
      const settled =
        storage === 'value' || storage === 'currentValue'
          ? (StatusAccessor.readSlot(first, nowOrMax) ?? setValue)
          : setValue;
      for (const mate of mates) StatusAccessor.writeSlot(mate, nowOrMax, settled);
      return true;
    });
  }

  /**
   * Writes a number into a slot of one item, as {@link setValue} writes the item a name stands for:
   * held within the item's bounds, a base or a correction carrying the maximum and the current value
   * along. False when the item has no such slot.
   */
  static writeSlot(data: DataElement, slot: ResourceSlot, setValue: number): boolean {
    const type = storageOf(data, slot);
    if (type == null) return false;
    if (type === 'value' || type === 'currentValue') {
      const clamped = heldWithinBounds(data, type, setValue);
      if (type === 'value') {
        data.value = clamped;
      } else {
        data.currentValue = clamped;
      }
      return true;
    }
    // Base / correction values: write directly to attribute. They are unbounded themselves;
    // the resulting effective min/max is what clamps `value` / `currentValue` afterwards.
    const attr = SLOT_ATTRIBUTE[type];
    if (!attr) return false;
    const dropEmpty = (type === 'maxCorrection' || type === 'minCorrection') && setValue === 0;
    if (!Number.isFinite(setValue) || dropEmpty) {
      data.removeAttribute(attr);
    } else {
      data.setAttribute(attr, String(setValue));
    }
    // For max-side edits, sync value (currentMax) to the new effective max so the
    // displayed "/X" follows base/correction changes (user can manually override
    // afterwards via the "/X" input or `:HP^...` chat command).
    if (type === 'maxBase' || type === 'maxCorrection') {
      const newEffectiveMax = data.effectiveMax;
      if (newEffectiveMax != null && Number(data.value) !== newEffectiveMax) {
        data.value = newEffectiveMax;
      }
    }
    // Re-clamp value (currentMax) / currentValue to the new effective bounds.
    const heldValue = numberHeldIn(data.value);
    if (heldValue != null) {
      const reclampedValue = heldWithinBounds(data, 'value', heldValue);
      if (reclampedValue !== heldValue) data.value = reclampedValue;
    }
    const heldCurrent = numberHeldIn(data.currentValue);
    if (heldCurrent != null) {
      const reclampedCurrent = heldWithinBounds(data, 'currentValue', heldCurrent);
      if (reclampedCurrent !== heldCurrent) data.currentValue = reclampedCurrent;
    }
    return true;
  }

  /**
   * Writes text into the item: a resource's current value, or anything else's value. False when
   * there is no such item.
   */
  setText(name: string, text: string): boolean {
    const targets = this.findAll(name);
    if (targets.length < 1) return false;
    GameObject.batch(() => {
      for (const data of targets) {
        if (data.type === DataElementType.NUMBER_RESOURCE) data.currentValue = text;
        else data.value = text;
      }
    });
    return true;
  }

  /**
   * Moves a slot of the item by an amount and returns the chat line describing it, such as `[Name
   * 10>7] `.
   *
   * The result is held within the item's bounds, and `(最小)` or `(最大)` is added where it was held
   * back. `limitMin` floors the value at 0 when no minimum is set, and `limitMax` caps the current
   * value at the maximum. Empty when there is no such item or slot.
   */
  changeValue(name: string, nowOrMax: ResourceSlot, addValue: number, limitMin?: boolean, limitMax?: boolean): string {
    return this.changeFound(this.findAll(name), nowOrMax, addValue, limitMin, limitMax);
  }

  /**
   * Moves a number a buff moves on the items found for it, as {@link changeValue} does, and notes what
   * it leaves in the item where the note is read: on an item a buff made, so a move is not taken for a
   * hand's as the buff goes; unless someone had written into the item otherwise, which stays noted so
   * (see {@link isWrittenOtherwise}).
   */
  changeByBuff(target: BuffTarget, nowOrMax: ResourceSlot, by: number): void {
    const [item] = target.items;
    if (!item) return;
    const byHand = isWrittenOtherwise(item);
    this.changeFound(target.items, nowOrMax, by);
    if (!byHand && (this.isMadeByBuff(item) || isNotedByBuffs(item))) noteLeftByBuffs(item);
  }

  /** The number a slot of the first item found for a buff holds, or null where it holds none. */
  valueOf(target: BuffTarget, slot: ResourceSlot): number | null {
    const [item] = target.items;
    return item ? StatusAccessor.readSlot(item, slot) : null;
  }

  /**
   * The item a buff names, found once (see {@link BuffTarget}): of the name as written and in
   * half-width characters, the one finding an item a value can be written into, else the one finding
   * any item, as written first. Null where neither finds one.
   */
  targetOf(reference: string): BuffTarget | null {
    const detail = this.detailDataElement;
    if (!detail) return null;
    const finding = [...new Set([reference, toHalfWidth(reference)])]
      .map((name) => ({ name, items: findReferencedElements(detail, name, this.aliases?.()) }))
      .filter((found) => found.items.length > 0);
    const picked = finding.find((found) => isChangeableElementType(found.items[0].type)) ?? finding[0];
    if (!picked) return null;
    const [item] = picked.items;
    return { name: picked.name, items: picked.items, takes: this.takesOfItem(item), made: this.isMadeByBuff(item) };
  }

  /** Moves a slot of the items a name found by an amount, as {@link changeValue} does. */
  private changeFound(
    found: readonly DataElement[],
    nowOrMax: ResourceSlot,
    addValue: number,
    limitMin?: boolean,
    limitMax?: boolean
  ): string {
    const [data] = found;
    if (!data) return '';
    const type = storageOf(data, nowOrMax) as SlotType | null;
    if (!type) return '';

    const oldNum = StatusAccessor.readSlot(data, nowOrMax);
    if (oldNum == null) return '';
    let target = oldNum + addValue;

    if (type === 'value' || type === 'currentValue') {
      if (limitMin && data.effectiveMin == null && target < 0) target = 0;
      if (limitMax && type === 'currentValue') {
        const currentMax = numberHeldIn(data.value);
        if (currentMax != null && target > currentMax) target = currentMax;
      }
    }

    StatusAccessor.writeFound(found, nowOrMax, target);
    const finalValue = StatusAccessor.readSlot(data, nowOrMax) ?? target;

    let suffix = '';
    if (finalValue !== oldNum + addValue) {
      suffix = finalValue > oldNum + addValue ? '(最小)' : '(最大)';
    }
    return `[${this.characterName()} ${oldNum}>${finalValue}${suffix}] `;
  }

  /**
   * What the item takes written into it: one of its choices for a select, words for a line of text,
   * prose or a note, numbers for a resource or a number field, and nothing for a check box, a picture
   * or a table. Null where there is no such item.
   */
  takesOf(name: string): ItemTakes | null {
    const data = this.findData(name);
    return data ? this.takesOfItem(data) : null;
  }

  /** What an item takes written into it (see {@link takesOf}). */
  private takesOfItem(data: DataElement): ItemTakes {
    if (!isChangeableElementType(data.type)) return { takes: 'nothing' };
    const takes =
      data.type === DataElementType.NOTE
        ? 'words'
        : data.type === DataElementType.TEXT
          ? FIELD_TAKES[data.fieldType]
          : 'numbers';
    if (takes === 'choice') {
      return { takes: 'choice', choices: parseSelectChoices(data.getAttribute(DataElementAttribute.CHOICES) ?? '') };
    }
    if (takes === 'words') return { takes: 'words', holdsNumber: StatusAccessor.readSlot(data, 'now') != null };
    return { takes };
  }

  /** Where a value written to the item lands; see {@link landingOn}. */
  landingOf(name: string, slot: ResourceSlot, written: string, as: WrittenAs): ItemLanding {
    return landingOn(this.takesOf(name), slot, written, as);
  }

  /** What the item holds, as text: a resource's amount left, anything else's value. Null where there is none. */
  getText(name: string): string | null {
    const data = this.findData(name);
    return data ? heldTextOf(data) : null;
  }

  /**
   * Whether a buff may make an item of this name at the foot of the sheet: no item of the sheet goes by
   * it, not even two that it cannot tell apart, and the name is no alias of the room's, which would read
   * the items it stands for rather than the one made. The chat's lint tells of an item to be made by
   * the same answer.
   */
  canMakeForBuff(name: string): boolean {
    return this.detailDataElement !== null && !this.holdsAnyNamed(name) && !isAliasName(name, this.aliases?.());
  }

  /**
   * Makes an item at the foot of the sheet for a buff, where one may be made (see
   * {@link canMakeForBuff}): a line of text holding nothing for words, or a number field holding 0 for
   * a number to move, and answers it as found for the buff. One the name does not find once made, as
   * one of items it cannot tell apart, is taken away again, which would leave one made again at every
   * buff. Null where nothing is made.
   */
  makeForBuff(name: string, holds: 'words' | 'number'): BuffTarget | null {
    if (!this.detailDataElement || !this.canMakeForBuff(name)) return null;
    const made = makeBuffItem(this.detailDataElement, name, holds === 'words' ? '' : 0);
    const target = this.targetOf(name);
    if (target?.items[0] === made) return target;
    dropBuffItem(made);
    return null;
  }

  /** Whether the sheet keeps any item a buff made for itself, which a sheet seldom does. */
  keepsBuffItems(): boolean {
    return this.detailDataElement !== null && keepsBuffItems(this.detailDataElement);
  }

  /** Takes away the section items buffs made are kept in, once it holds none. */
  tidyBuffItems(): void {
    if (this.detailDataElement) tidyBuffItems(this.detailDataElement);
  }

  /** The items buffs made for themselves that the sheet keeps, themselves rather than by name. */
  madeItems(): DataElement[] {
    return this.detailDataElement ? buffItemsIn(this.detailDataElement) : [];
  }

  /** Whether an item of the sheet was made by a buff for itself, and is the buff's still. */
  private isMadeByBuff(data: DataElement): boolean {
    return this.detailDataElement !== null && keepsBuffItems(this.detailDataElement) && isBuffMadeItem(data);
  }

  private findData(reference: string): DataElement | null {
    return this.findAll(reference)[0] ?? null;
  }

  /**
   * The items a name finds, the room's aliases counted: as written, or else in half-width characters,
   * as a name typed with the input method's full-width letters is meant. Every read and write by name
   * goes through here, a chat command's and a buff's alike.
   */
  private findAll(reference: string): DataElement[] {
    if (!this.detailDataElement) return [];
    const found = findReferencedElements(this.detailDataElement, reference, this.aliases?.());
    const halfWidth = toHalfWidth(reference);
    if (found.length > 0 || halfWidth === reference) return found;
    return findReferencedElements(this.detailDataElement, halfWidth, this.aliases?.());
  }

  /**
   * The name an item is found by, as written or in half-width characters (see {@link findAll}), which
   * is what a command or a buff that names it records: of the two, the one finding an item a value can
   * be written into, else the one finding any item, as written first; null where neither finds one. A
   * check box named in full-width beside a resource of the half-width name leaves the resource found.
   */
  nameOf(reference: string): string | null {
    return this.targetOf(reference)?.name ?? null;
  }

  /** Whether any item of the sheet goes by a name, as written or in half-width, found by it or not, as one of two by one name is not. */
  private holdsAnyNamed(name: string): boolean {
    const detail = this.detailDataElement;
    if (!detail) return false;
    return [name, toHalfWidth(name)].some((each) => detail.getElementsByName(each.trim()).length > 0);
  }
}
