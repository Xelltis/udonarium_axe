import { setPortraitNameOf } from '@axe/domain/character/character-portrait';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';

/**
 * Adds a picture to the character's portraits as another of them, named as given, and has the piece
 * show it: the portraits it had are kept, to be chosen again. Nothing for a character with no list
 * of pictures. Answers the entry added.
 */
export function addShownPortrait(character: GameCharacter, imageIdentifier: string, name: string): DataElement | null {
  const images = character.imageDataElement;
  if (!images) return null;
  const added = DataElement.create('imageIdentifier', imageIdentifier, { type: 'image' }, '');
  setPortraitNameOf(added, name);
  images.appendChild(added);
  character.addExtendData();
  const icon = character.detailDataElement?.getFirstElementByName('ICON');
  if (icon) {
    icon.value = images.children.length - 1;
    icon.currentValue = images.children.length - 1;
  }
  character.update();
  return added;
}
