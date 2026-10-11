import { isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';
import { findByReference } from '@axe/domain/hotbar/hotbar-reference';

export interface SlotActorRef {
  characterIdentifier: string;
  characterName: string;
}

export interface SlotActor {
  character: GameCharacter;
  /** True where the slot found its piece by name, so the identifier it holds is out of date. */
  renamed: boolean;
}

/**
 * The piece a slot acts as, in a room that may not be the one the slot was written in.
 *
 * The identifier is asked for first. A bar carried into another room, or into a game played
 * with other pieces, holds identifiers that mean nothing there, so the name the slot was
 * saved with is tried next: where exactly one piece the reader may work goes by that name,
 * the slot takes it and says so, and the caller writes the new identifier down.
 */
export function findSlotActor(
  slot: SlotActorRef,
  characters: readonly GameCharacter[],
  userId: string
): SlotActor | null {
  return findSlotActorAmong(
    slot,
    characters.filter((character) => isControllableByUser(character, userId))
  );
}

/**
 * The same, among pieces already known to be the reader's to work.
 *
 * The bar asks for ten slots at once, and sifting the room ten times over is ten times the
 * work for one answer, so it sifts once and hands the same list to each.
 */
export function findSlotActorAmong(slot: SlotActorRef, controllable: readonly GameCharacter[]): SlotActor | null {
  const found = findByReference(controllable, slot.characterIdentifier, slot.characterName);
  return found ? { character: found.thing, renamed: found.renamed } : null;
}
