import { GameCharacter } from '@axe/domain/character/game-character';

export const GRAVEYARD_LOCATION = 'graveyard';

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
