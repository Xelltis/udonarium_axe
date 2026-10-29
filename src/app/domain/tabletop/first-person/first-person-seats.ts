import { GRAVEYARD_LOCATION, isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';

/** A piece somebody may look out of in first person, by its identifier and the name it goes by. */
export interface FirstPersonSeat {
  identifier: string;
  name: string;
}

/**
 * The pieces a user may look out of in first person: those they may move, and those of a party
 * that names them among its players, standing where a view can be drawn from, in the order given.
 */
export function firstPersonSeats(
  characters: readonly GameCharacter[],
  userId: string,
  canLookOutOf: (character: GameCharacter) => boolean,
  playedParties: ReadonlySet<string> = new Set()
): FirstPersonSeat[] {
  return characters
    .filter((character) => mayLookOutOf(character, userId, playedParties) && canLookOutOf(character))
    .map((character) => ({ identifier: character.identifier, name: character.name }));
}

function mayLookOutOf(character: GameCharacter, userId: string, playedParties: ReadonlySet<string>): boolean {
  if (isControllableByUser(character, userId)) return true;
  if (character.location.name === GRAVEYARD_LOCATION) return false;
  return character.partyIdentifier.length > 0 && playedParties.has(character.partyIdentifier);
}
