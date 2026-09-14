import { GameCharacter } from '@axe/domain/character/game-character';

export const GRAVEYARD_LOCATION = 'graveyard';

/**
 * Whether the user owns the character and it is not in the graveyard; an empty user id owns
 * nothing.
 */
export function isOwnedByUser(character: GameCharacter, userId: string): boolean {
  if (userId.length === 0) return false;
  if (character.owner !== userId) return false;
  return character.location.name !== GRAVEYARD_LOCATION;
}

/** The characters the user owns outside the graveyard, in the order given. */
export function selectOwnedCharacters(characters: readonly GameCharacter[], userId: string): GameCharacter[] {
  return characters.filter((character) => isOwnedByUser(character, userId));
}

/**
 * Whose piece you may take up and work: your own, and the ones nobody has claimed.
 *
 * An unclaimed piece is anyone's to move, so it is anyone's to point a hotbar at as well.
 */
export function isControllableByUser(character: GameCharacter, userId: string): boolean {
  if (character.location.name === GRAVEYARD_LOCATION) return false;
  if (character.owner.length < 1) return true;
  return userId.length > 0 && character.owner === userId;
}

/**
 * The characters the user may take up, their own and the unclaimed, outside the graveyard and in
 * the order given.
 */
export function selectControllableCharacters(characters: readonly GameCharacter[], userId: string): GameCharacter[] {
  return characters.filter((character) => isControllableByUser(character, userId));
}

/** Whether the character is showing on the table. */
export function isOnTable(character: GameCharacter): boolean {
  return character.isVisibleOnTable;
}
