import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';

/**
 * The character's picture entry at that position in its picture list, or null when the index is out
 * of range.
 */
export function portraitElementAt(character: GameCharacter, index: number): DataElement | null {
  const children = character.imageDataElement?.children ?? [];
  return index >= 0 && index < children.length ? children[index] : null;
}

/** The pictures of all the character's portraits, in order. */
export function portraitPicturesOf(character: GameCharacter): string[] {
  return (character.imageDataElement?.children ?? []).map((child) => `${child.value ?? ''}`).filter(Boolean);
}

/**
 * The name given to a picture entry, which is kept in its current value. Empty when it has none.
 */
export function portraitNameOf(element: DataElement | null | undefined): string {
  const name = element?.currentValue;
  return name == null ? '' : String(name);
}

/** Gives a picture entry a name, trimmed and kept in its current value. */
export function setPortraitNameOf(element: DataElement, name: string): void {
  element.currentValue = name.trim();
}
