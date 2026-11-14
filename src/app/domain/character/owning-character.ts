import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';

/** The character whose sheet holds a data element, however deep it sits, or null where no character is above it. */
export function owningCharacterOf(element: DataElement): GameCharacter | null {
  let node = element.parent;
  while (node) {
    if (node instanceof GameCharacter) return node;
    node = node.parent;
  }
  return null;
}
