import { GameCharacter } from '@axe/domain/character/game-character';

export interface FirstPersonShareChoice {
  identifier: string;
  name: string;
  playerOwned: boolean;
  shared: boolean;
}

export function firstPersonShareChoices(
  characters: readonly GameCharacter[],
  sharedIdentifier: string,
  canLookOutOf: (character: GameCharacter) => boolean
): FirstPersonShareChoice[] {
  return characters
    .filter((character) => canLookOutOf(character))
    .map((character) => ({
      identifier: character.identifier,
      name: character.name,
      playerOwned: character.owner.trim().length > 0,
      shared: character.identifier === sharedIdentifier,
    }));
}
