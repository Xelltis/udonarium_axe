export const HOTBAR_SLOT_KINDS = [
  'chat',
  'effect',
  'range',
  'diceDeploy',
  'panel',
  'focus',
  'sound',
  'cutIn',
  'prefill',
  'turn',
  'appearance',
  'group',
] as const;

export type HotbarSlotKind = (typeof HOTBAR_SLOT_KINDS)[number];

export const DEFAULT_HOTBAR_SLOT_KIND: HotbarSlotKind = 'chat';

const CHARACTER_BOUND_KINDS: ReadonlySet<HotbarSlotKind> = new Set<HotbarSlotKind>([
  'chat',
  'effect',
  'range',
  'diceDeploy',
  'panel',
  'focus',
  'appearance',
]);

export function isHotbarSlotKind(value: unknown): value is HotbarSlotKind {
  return typeof value === 'string' && (HOTBAR_SLOT_KINDS as readonly string[]).includes(value);
}

/** Anything unknown reads as a chat macro, so a slot written by a newer version still does something. */
export function toHotbarSlotKind(value: unknown): HotbarSlotKind {
  return isHotbarSlotKind(value) ? value : DEFAULT_HOTBAR_SLOT_KIND;
}

export function hotbarSlotNeedsCharacter(kind: HotbarSlotKind): boolean {
  return CHARACTER_BOUND_KINDS.has(kind);
}
