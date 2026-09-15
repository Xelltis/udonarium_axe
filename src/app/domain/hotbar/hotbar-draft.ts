import { encodeHotbarPayload, HotbarPayload, parseHotbarPayload } from '@axe/domain/hotbar/hotbar-payload';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { DEFAULT_HOTBAR_SLOT_KIND, HotbarSlotKind, toHotbarSlotKind } from '@axe/domain/hotbar/hotbar-slot-kind';

export interface HotbarSlotDraft {
  kind: HotbarSlotKind;
  value: string;
  /** What the value pointed at when it was chosen, for a bar read in another room. */
  valueName: string;
  characterIdentifier: string;
  /** The name that piece went by, so a bar carried into another room can find it again. */
  characterName: string;
  label: string;
  icon: string;
  color: string;
  payload: HotbarPayload;
}

/** A blank slot of the given kind, with that kind's default options, for the editor to fill in. */
export function emptyHotbarSlotDraft(kind: HotbarSlotKind = DEFAULT_HOTBAR_SLOT_KIND): HotbarSlotDraft {
  return {
    kind,
    value: '',
    valueName: '',
    characterIdentifier: '',
    characterName: '',
    label: '',
    icon: '',
    color: '',
    payload: parseHotbarPayload(kind, null),
  };
}

/** What a slot on the bar holds, in the form a slot is written and carried in. */
export function draftOfSlot(slot: HotbarSlot): HotbarSlotDraft {
  return {
    kind: slot.slotKind,
    value: slot.argument,
    valueName: slot.valueName,
    characterIdentifier: slot.characterIdentifier,
    characterName: slot.characterName,
    label: slot.label,
    icon: slot.icon,
    color: slot.color,
    payload: slot.options,
  };
}

/** Writes a slot draft as one JSON string, the reverse of `parseHotbarSlotDraft`. */
export function encodeHotbarSlotDraft(draft: HotbarSlotDraft): string {
  return JSON.stringify({
    kind: draft.kind,
    value: draft.value,
    valueName: draft.valueName,
    characterIdentifier: draft.characterIdentifier,
    characterName: draft.characterName,
    label: draft.label,
    icon: draft.icon,
    color: draft.color,
    payload: encodeHotbarPayload(draft.payload),
  });
}

/**
 * Reads a slot draft back from the JSON string `encodeHotbarSlotDraft` writes.
 *
 * Null for anything that is not a JSON object carrying a kind. Missing text fields read as
 * empty, and an unknown kind reads as a chat macro.
 */
export function parseHotbarSlotDraft(raw: unknown): HotbarSlotDraft | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const held = parsed as Record<string, unknown>;
  if (!('kind' in held)) return null;
  const kind = toHotbarSlotKind(held.kind);
  return {
    kind,
    value: readString(held.value),
    valueName: readString(held.valueName),
    characterIdentifier: readString(held.characterIdentifier),
    characterName: readString(held.characterName),
    label: readString(held.label),
    icon: readString(held.icon),
    color: readString(held.color),
    payload: parseHotbarPayload(kind, held.payload),
  };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
