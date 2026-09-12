import { isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';

export interface FirstPersonSeat {
  identifier: string;
  name: string;
}

export function firstPersonSeats(
  characters: readonly GameCharacter[],
  userId: string,
  canLookOutOf: (character: GameCharacter) => boolean
): FirstPersonSeat[] {
  return characters
    .filter((character) => isControllableByUser(character, userId) && canLookOutOf(character))
    .map((character) => ({ identifier: character.identifier, name: character.name }));
}
