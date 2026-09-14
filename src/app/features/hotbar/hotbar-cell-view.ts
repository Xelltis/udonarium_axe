import { GameCharacter } from '@axe/domain/character/game-character';
import { hotbarSlotColor, hotbarSlotIcon, hotbarSlotLabel } from '@axe/domain/hotbar/hotbar-appearance';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { hotbarSlotNeedsCharacter } from '@axe/domain/hotbar/hotbar-slot-kind';
import { findSlotActorAmong } from '@axe/features/hotbar/hotbar-actor';

export interface HotbarCellView {
  slotIndex: number;
  slot: HotbarSlot | null;
  label: string;
  icon: string;
  color: string;
  needsCharacter: boolean;
  key: string;
  /** Who the slot acts as when it is fired, which is not always who it is named after. */
  actor: GameCharacter | null;
  actorName: string;
}

/** What the bar has to look up for itself before a cell can be described. */
export interface HotbarCellContext {
  /** The pieces this reader may work, sifted once for the whole bar. */
  controllable: readonly GameCharacter[];
  /** Who a slot naming nobody acts as: whoever the chat is set to speak as. */
  speaker: GameCharacter | null;
  /** What a slot points at by identifier, named as it stands now, so a rename shows through. */
  referencedName(slot: HotbarSlot): string;
  keyOf(slotIndex: number): string;
}

/** Whether a slot names a piece of its own rather than acting as whoever is speaking. */
export function bindsCharacter(slot: HotbarSlot): boolean {
  return slot.characterIdentifier.trim().length > 0 || slot.characterName.trim().length > 0;
}

/** The piece a slot names for itself, found again by name in a room that brought new ones. */
export function namedCharacter(slot: HotbarSlot, controllable: readonly GameCharacter[]): GameCharacter | null {
  if (!bindsCharacter(slot)) return null;
  return findSlotActorAmong(slot, controllable)?.character ?? null;
}

/**
 * Describes a slot of the bar with nothing in it, keeping only where it is and the key that fires
 * it.
 */
export function emptyCellView(slotIndex: number, key: string): HotbarCellView {
  return {
    slotIndex,
    slot: null,
    label: '',
    icon: '',
    color: '',
    needsCharacter: false,
    key,
    actor: null,
    actorName: '',
  };
}

/**
 * Describes a slot of the bar for drawing: its label, icon and colour, whether it needs a
 * character, and who it acts as when fired.
 *
 * A slot that names a piece acts as that piece, or as nobody when the piece cannot be found among
 * those the reader may work. Only a slot that names nobody acts as whoever the chat is set to speak
 * as.
 */
export function hotbarCellView(slot: HotbarSlot | null, slotIndex: number, context: HotbarCellContext): HotbarCellView {
  const key = context.keyOf(slotIndex);
  if (!slot) return emptyCellView(slotIndex, key);

  const kind = slot.slotKind;
  const named = namedCharacter(slot, context.controllable);
  return {
    slotIndex,
    slot,
    label: hotbarSlotLabel(slot.argument, slot.label, context.referencedName(slot)),
    icon: hotbarSlotIcon(kind, slot.argument, slot.icon),
    color: hotbarSlotColor(kind, slot.color),
    needsCharacter: hotbarSlotNeedsCharacter(kind),
    key,
    // A slot that names a piece acts as that piece or as nobody. Falling back to whoever the
    // chat is set to speak as would send someone else's attack under the reader's own name.
    actor: bindsCharacter(slot) ? named : context.speaker,
    actorName: named?.name ?? slot.characterName,
  };
}
