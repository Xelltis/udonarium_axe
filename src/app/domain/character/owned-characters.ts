import { GRAVEYARD_LOCATION, isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';

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

/**
 * The characters on the table nobody has claimed, which a user with no character of their own can
 * take up from the empty list.
 */
export function selectClaimableCharacters(characters: readonly GameCharacter[]): GameCharacter[] {
  return characters.filter((character) => character.owner.length < 1 && isOnTable(character));
}
