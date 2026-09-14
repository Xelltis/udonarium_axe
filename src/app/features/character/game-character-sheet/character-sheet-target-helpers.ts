import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { CharacterSheetTarget } from '@axe/domain/tabletop/character-sheet-target';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';

/**
 * Places a copy of a piece from its sheet, offset down and to the right of the original, and plays
 * the sound for its kind.
 *
 * The copy joins the same parent as the original. A copied terrain, card, card stack or mask starts
 * unlocked, and a copied card or stack starts with nobody peeking at it; cards, stacks and notes
 * are brought to the top.
 */
export function cloneTabletopObject(source: CharacterSheetTarget, offsetPx = 50): void {
  const cloneObject = source.clone();
  cloneObject.location.x += offsetPx;
  cloneObject.location.y += offsetPx;
  if (source.parent) source.parent.appendChild(cloneObject);
  cloneObject.update();

  if (cloneObject instanceof Terrain) {
    cloneObject.isLocked = false;
    SoundEffect.play(PresetSound.blockPut);
  } else if (cloneObject instanceof Card) {
    cloneObject.owner = '';
    cloneObject.toTopmost();
    cloneObject.isLock = false;
    SoundEffect.play(PresetSound.cardPut);
  } else if (cloneObject instanceof CardStack) {
    cloneObject.owner = '';
    cloneObject.toTopmost();
    cloneObject.isLock = false;
    SoundEffect.play(PresetSound.cardPut);
  } else if (cloneObject instanceof GameTableMask) {
    cloneObject.isLock = false;
    SoundEffect.play(PresetSound.cardPut);
  } else if (cloneObject instanceof TextNote) {
    cloneObject.toTopmost();
    SoundEffect.play(PresetSound.cardPut);
  } else if (cloneObject instanceof DiceSymbol) {
    SoundEffect.play(PresetSound.dicePut);
    SoundEffect.play(PresetSound.piecePut);
  } else {
    SoundEffect.play(PresetSound.piecePut);
  }
}
