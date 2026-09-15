import { toHalfWidth } from '@axe/core/util/string-util';

/**
 * The parts of a resource an operation can be written against.
 *
 * A resource keeps a value and a maximum, and each of its bounds is a base with a correction
 * on top, so an operation has to say which of them it means. The chat commands, the buffs and
 * the remote each said it in their own words and covered a different part of it; this is the
 * one vocabulary they share.
 */
export const RESOURCE_SLOTS = ['now', 'max', 'maxBase', 'maxCorrection', 'minBase', 'minCorrection'] as const;

export type ResourceSlot = (typeof RESOURCE_SLOTS)[number];

const RESOURCE_SLOT_SET: ReadonlySet<string> = new Set(RESOURCE_SLOTS);

/** The slot this names, or nothing where it names none. */
export function asResourceSlot(value: string | null | undefined): ResourceSlot | null {
  return value != null && RESOURCE_SLOT_SET.has(value) ? (value as ResourceSlot) : null;
}

/** The written form of each slot, longest first so `_MAX_BUFF` is not read as `_MAX`. */
const SLOT_SUFFIXES: readonly { token: string; slot: ResourceSlot }[] = [
  { token: '_MAX_BUFF', slot: 'maxCorrection' },
  { token: '_MIN_BUFF', slot: 'minCorrection' },
  { token: '_MAX', slot: 'maxBase' },
  { token: '_MIN', slot: 'minBase' },
];

const CURRENT_MAX_SUFFIX = /[\^＾]$/;

export interface NamedResourceSlot {
  /** What is left of the name once the slot has been read off the end of it. */
  name: string;
  slot: ResourceSlot;
}

/**
 * Reads the slot off the end of a name, the way a command is written.
 *
 * `HP^` is the maximum it stands at, `HP_MAX` the base that maximum is built from, and
 * `HP_MAX_BUFF` the correction on top of that base; the minimum is written the same way. A
 * name with nothing on the end is the value itself. The forms are matched against the
 * half-width upper case of the name, so `hp_max` and `ＨＰ＿ＭＡＸ` are read alike.
 */
export function readNamedResourceSlot(raw: string): NamedResourceSlot {
  const trimmed = raw.replace(/\s+$/g, '');
  const halfWidth = toHalfWidth(trimmed).toUpperCase();

  for (const { token, slot } of SLOT_SUFFIXES) {
    if (!halfWidth.endsWith(token)) continue;
    const name = trimmed.slice(0, trimmed.length - token.length);
    if (name.length > 0) return { name, slot };
  }
  if (CURRENT_MAX_SUFFIX.test(trimmed)) {
    const name = trimmed.slice(0, trimmed.length - 1);
    if (name.length > 0) return { name, slot: 'max' };
  }
  return { name: trimmed, slot: 'now' };
}

/** How the slot reads in a chat line. The value itself needs no saying. */
const SLOT_LABELS: Record<ResourceSlot, string> = {
  now: '',
  max: '最大値',
  maxBase: '最大ベース',
  maxCorrection: '最大補正',
  minBase: '最小ベース',
  minCorrection: '最小補正',
};

/** The Japanese label naming a slot in a chat line; empty for the current value, which needs none. */
export function resourceSlotLabel(slot: ResourceSlot): string {
  return SLOT_LABELS[slot];
}

/** The same, as it reads in front of a status on a buff badge, where the space is tighter. */
const SLOT_BADGE_PREFIXES: Record<ResourceSlot, string> = {
  now: '',
  max: '最大',
  maxBase: '最大ベース',
  maxCorrection: '最大補正',
  minBase: '最小ベース',
  minCorrection: '最小補正',
};

/** The shorter Japanese prefix put before a status name on a buff badge; empty for the current value. */
export function resourceSlotBadgePrefix(slot: ResourceSlot): string {
  return SLOT_BADGE_PREFIXES[slot];
}
