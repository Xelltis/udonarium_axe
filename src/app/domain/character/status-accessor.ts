import { GameObject } from '@axe/core/sync/game-object';
import { allowsOverResource } from '@axe/domain/character/over-resource';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import type { ElementAliasTable } from '@axe/domain/data/element-alias';
import { findReferencedElements } from '@axe/domain/data/element-reference';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';

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
export class StatusAccessor {
  constructor(
    private readonly detailDataElement: DataElement | null,
    private readonly characterName: () => string,
    /** The aliases a name is looked up with; the room's own where none are handed in. */
    private readonly aliases?: () => ElementAliasTable
  ) {}

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
    const [first, ...mates] = this.findAll(name);
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
    const data = this.findData(name);
    if (!data) return '';
    const type = this.getType(name, nowOrMax) as SlotType | null;
    if (!type) return '';

    const oldNum = this.getValue(name, nowOrMax);
    if (oldNum == null) return '';
    let target = oldNum + addValue;

    if (type === 'value' || type === 'currentValue') {
      if (limitMin && data.effectiveMin == null && target < 0) target = 0;
      if (limitMax && type === 'currentValue') {
        const currentMax = numberHeldIn(data.value);
        if (currentMax != null && target > currentMax) target = currentMax;
      }
    }

    this.setValue(name, nowOrMax, target);
    const finalValue = this.getValue(name, nowOrMax) ?? target;

    let suffix = '';
    if (finalValue !== oldNum + addValue) {
      suffix = finalValue > oldNum + addValue ? '(最小)' : '(最大)';
    }
    return `[${this.characterName()} ${oldNum}>${finalValue}${suffix}] `;
  }

  private findData(reference: string): DataElement | null {
    return this.findAll(reference)[0] ?? null;
  }

  private findAll(reference: string): DataElement[] {
    if (!this.detailDataElement) return [];
    return findReferencedElements(this.detailDataElement, reference, this.aliases?.());
  }
}
