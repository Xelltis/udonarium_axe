import { VnEmote } from '@axe/domain/visual-novel/vn-emote';
import { toPortraitSlot } from '@axe/domain/visual-novel/vn-portrait-position';

export const VN_STAGE_SLOT_COUNT = 12;
export const VN_STAGE_MAX = 6;
export const VN_STAGE_LOOKBACK = 60;

const LEFT_MIN = 8;
const LEFT_MAX = 92;
const LEFT_SPAN = LEFT_MAX - LEFT_MIN;

export const VN_STAGE_MIN_GAP = LEFT_SPAN / (VN_STAGE_SLOT_COUNT - 1);

export interface VnStageSource {
  name: string;
  placedAt: number;
  sendFrom: string;
  imageIdentifier: string;
  imagePos: unknown;
  vnPortraitPos: number;
  isSystemMessage: boolean;
  isDicebot: boolean;
  isGameCharacter: boolean;
  isDiceCommand: boolean;
  emote: VnEmote;
}

export interface VnStageCharacter {
  /** Which piece this is, since two of them can share a name and one can be said under several. */
  id: string;
  name: string;
  url: string;
  left: number;
  slot: number;
  isActive: boolean;
  isFlipped: boolean;
  /** Standing for the last time: the line being read is the one they leave on. */
  isLeaving: boolean;
}

/** The same span the chat portraits use, so slot 0 and slot 11 land on the same edges. */
export function leftOfSlot(slot: number): number {
  return LEFT_MIN + LEFT_SPAN * (slot / (VN_STAGE_SLOT_COUNT - 1));
}

/**
 * The strip of the slot guide that picks a slot.
 *
 * The slots themselves stand between 8% and 92%, but the guide covers the whole width, so the
 * bands run to the edges rather than sitting as islands with dead ground on either side.
 */
export function slotBandLeft(slot: number): number {
  if (slot <= 0) return 0;
  return (leftOfSlot(slot - 1) + leftOfSlot(slot)) / 2;
}

/** How wide a slot's strip of the slot guide is, as a percentage of the stage, the end strips running to the edge. */
export function slotBandWidth(slot: number): number {
  const right = slot >= VN_STAGE_SLOT_COUNT - 1 ? 100 : (leftOfSlot(slot) + leftOfSlot(slot + 1)) / 2;
  return right - slotBandLeft(slot);
}

/** Where the number sits inside its band, so it keeps standing over the slot itself. */
export function slotLabelLeftInBand(slot: number): number {
  return ((leftOfSlot(slot) - slotBandLeft(slot)) / slotBandWidth(slot)) * 100;
}

/**
 * Who said a line: the piece it came from, not the name it was said under.
 *
 * A name is written into the message as it stood then, so a piece renamed mid-session, or one
 * whispering (which is recorded as "speaker > listener"), would otherwise stand twice.
 */
export function stageIdentityOf(source: VnStageSource): string {
  return source.sendFrom.length > 0 ? source.sendFrom : source.name;
}

/** A portrait position as a stage slot, taking anything missing or off the stage as slot 0. */
export function slotOf(imagePos: number | null): number {
  if (imagePos == null || imagePos < 0 || imagePos >= VN_STAGE_SLOT_COUNT) return 0;
  return imagePos;
}

/** What a message alone can say about where its speaker stands. */
export function messageSlotOf(source: VnStageSource): number {
  return toPortraitSlot(source.vnPortraitPos) ?? toPortraitSlot(source.imagePos) ?? 0;
}

/**
 * Keeps `desired` in order and at least `gap` apart within `min`..`max`.
 * `desired` must be ascending: the pass pushes rather than reorders.
 */
export function spreadStagePositions(desired: readonly number[], gap: number, min: number, max: number): number[] {
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  if (desired.length < 1) return [];
  if (desired.length < 2) return [clamp(desired[0])];

  const step = Math.min(gap, (max - min) / (desired.length - 1));
  const spread = [clamp(desired[0])];
  for (let i = 1; i < desired.length; i++) {
    spread.push(Math.max(clamp(desired[i]), spread[i - 1] + step));
  }

  if (spread[spread.length - 1] > max) {
    spread[spread.length - 1] = max;
    for (let i = spread.length - 2; i >= 0; i--) {
      spread[i] = Math.min(spread[i], spread[i + 1] - step);
    }
  }
  return spread;
}

/**
 * A cast entirely on slot 0 is a room that never touched the setting, since that is what every
 * character is made with, so it is spread over the whole stage instead of stacked on the left.
 * Anywhere else is taken as meant and only nudged apart.
 */
function desiredPositions(slots: readonly number[]): number[] {
  if (slots.length > 1 && slots.every((slot) => slot === 0)) {
    return slots.map((_, index) => LEFT_MIN + LEFT_SPAN * ((index + 0.5) / slots.length));
  }
  return slots.map(leftOfSlot);
}

/**
 * Whether a clearing of the stage holds for the line being read.
 *
 * Reading back to before it shows the stage as it stood then, the way a scene change does.
 * Being at the latest line counts as being after it: the notice it leaves is housekeeping and
 * is kept out of the script, so with nothing said since, the last line said is still "now".
 */
export function stageCutFor(resetAt: number, currentPlacedAt: number, isLatest: boolean): number {
  if (resetAt <= 0) return 0;
  return isLatest || currentPlacedAt >= resetAt ? resetAt : 0;
}

/**
 * Who stands on the novel stage for the last line of `window`, and where.
 *
 * Reading back from that line, it gathers up to six characters with a portrait, one per piece, and
 * stops at a scene change or at `cut`. System lines, dice and dice commands are passed over; a
 * character who left the stage is dropped, unless the current line is the one they leave on. A
 * location or scene line clears the stage. The cast is ordered by slot, spread apart, and the
 * speaker of an ordinary current line is marked active.
 */
export function buildVnStage(
  window: readonly VnStageSource[],
  resolveUrl: (imageIdentifier: string) => string,
  resolveSlot: (source: VnStageSource) => number = messageSlotOf,
  cut = 0
): VnStageCharacter[] {
  const current = window[window.length - 1];
  if (!current) return [];
  if (current.emote.kind === 'location' || current.emote.kind === 'scene') return [];

  const found = new Map<string, { name: string; url: string; slot: number; isFlipped: boolean; isLeaving: boolean }>();
  const retired = new Set<string>();
  for (let i = window.length - 1; i >= 0 && found.size < VN_STAGE_MAX; i--) {
    const source = window[i];
    if (cut > 0 && source.placedAt < cut) break;
    if (source.isSystemMessage || source.isDicebot) continue;
    if (source.isDiceCommand) continue;
    if (source.emote.kind === 'scene') break;
    if (!source.isGameCharacter) continue;
    if (source.name.length < 1 || source.imageIdentifier.length < 1) continue;
    const identity = stageIdentityOf(source);
    if (found.has(identity) || retired.has(identity)) continue;
    if (source.emote.exited) {
      // The line they leave on is still theirs to say. They stand for it and fade as it is
      // read, rather than being gone before the words they leave with are shown.
      retired.add(identity);
      if (i !== window.length - 1) continue;
      const parting = resolveUrl(source.imageIdentifier);
      if (parting.length < 1) continue;
      found.set(identity, {
        name: source.name,
        url: parting,
        slot: slotOf(resolveSlot(source)),
        isFlipped: source.emote.flipped,
        isLeaving: true,
      });
      continue;
    }
    const url = resolveUrl(source.imageIdentifier);
    if (url.length < 1) continue;
    found.set(identity, {
      name: source.name,
      url,
      slot: slotOf(resolveSlot(source)),
      isFlipped: source.emote.flipped,
      isLeaving: false,
    });
  }
  if (found.size < 1) return [];

  const activeIdentity =
    !current.isSystemMessage && !current.isDicebot && !current.isDiceCommand && current.emote.kind === 'normal'
      ? stageIdentityOf(current)
      : '';

  const cast = [...found.entries()].sort(([, a], [, b]) => a.slot - b.slot || a.name.localeCompare(b.name));
  const lefts = spreadStagePositions(
    desiredPositions(cast.map(([, info]) => info.slot)),
    VN_STAGE_MIN_GAP,
    LEFT_MIN,
    LEFT_MAX
  );
  return cast.map(([id, info], index) => ({
    id,
    name: info.name,
    url: info.url,
    left: lefts[index],
    slot: info.slot,
    isActive: id === activeIdentity,
    isFlipped: info.isFlipped,
    isLeaving: info.isLeaving,
  }));
}
