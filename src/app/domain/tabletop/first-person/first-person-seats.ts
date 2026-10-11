import { isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';

/** A piece somebody may look out of in first person, by its identifier and the name it goes by. */
export interface FirstPersonSeat {
  identifier: string;
  name: string;
}

/**
 * The pieces a user may look out of in first person: those they may move, standing where a view can
 * be drawn from, in the order given.
 */
export function firstPersonSeats(
  characters: readonly GameCharacter[],
  userId: string,
  canLookOutOf: (character: GameCharacter) => boolean
): FirstPersonSeat[] {
  return characters
    .filter((character) => isControllableByUser(character, userId) && canLookOutOf(character))
    .map((character) => ({ identifier: character.identifier, name: character.name }));
}
