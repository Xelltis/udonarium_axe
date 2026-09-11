import { GRAVEYARD_LOCATION, isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';

export function isOwnedByUser(character: GameCharacter, userId: string): boolean {
  if (userId.length === 0) return false;
  if (character.owner !== userId) return false;
  return character.location.name !== GRAVEYARD_LOCATION;
}

export function selectOwnedCharacters(characters: readonly GameCharacter[], userId: string): GameCharacter[] {
  return characters.filter((character) => isOwnedByUser(character, userId));
}

export function selectControllableCharacters(characters: readonly GameCharacter[], userId: string): GameCharacter[] {
  return characters.filter((character) => isControllableByUser(character, userId));
}

export function isOnTable(character: GameCharacter): boolean {
  return character.isVisibleOnTable;
}
