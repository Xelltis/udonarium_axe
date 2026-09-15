import { inject, Injectable } from '@angular/core';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  heldDiceOf,
  HeldDie,
  heldDieOfSymbol,
  removeHeldDie,
  storeHeldDie,
  takeHeldDice,
} from '@axe/domain/character/character-dice';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';

/** How far apart the dice stand, and how far from the piece that laid them out. */
const DICE_STEP_PX = 55;
const DICE_OFFSET_PX = 60;

/**
 * Laying a character's dice out on the table, and putting them away again.
 *
 * What the character keeps is data on its sheet. A die only becomes a thing on the table
 * when it is laid out, and goes back to being data when it is put away, so the pieces on
 * the board are the dice actually in play.
 */
@Injectable({ providedIn: 'root' })
export class CharacterDiceService {
  private readonly objectStore = inject(ObjectStore);

  /** The dice a character keeps on its sheet, which are the ones not out on the table. */
  held(character: GameCharacter): HeldDie[] {
    return heldDiceOf(character);
  }

  /** The dice of this character that are out on the table, in the order they were laid. */
  laidOut(character: GameCharacter): DiceSymbol[] {
    return this.objectStore
      .getObjects<DiceSymbol>(DiceSymbol)
      .filter((die) => die.ownerCharacterIdentifier === character.identifier);
  }

  /**
   * Takes every die of this character off the table, and says how many came back.
   *
   * A handful swept up is one sweep: the sound belongs to the gesture rather than to each
   * die, and six of them at once would be six of the same noise over one another.
   */
  putAway(character: GameCharacter): number {
    let taken = 0;
    for (const die of this.laidOut(character)) {
      if (this.take(character, die)) taken++;
    }
    if (taken > 0) SoundEffect.play(PresetSound.sweep);
    return taken;
  }

  /**
   * Puts every die the character keeps onto the table beside it.
   *
   * They are laid out in a row rather than in a pile, so a handful can be read and thrown
   * without moving them apart first. Each belongs to the character it came from, which is
   * what a chat roll written against that name reaches.
   *
   * Laying them out takes them off the sheet: a die is on the table or kept, never both,
   * and pressing again would otherwise make a fresh set every time.
   */
  deploy(character: GameCharacter): DiceSymbol[] {
    const dice = takeHeldDice(character);
    if (dice.length < 1) return [];

    const laid: DiceSymbol[] = [];
    for (const die of dice) {
      for (let index = 0; index < die.count; index++) {
        laid.push(this.layOut(character, die, laid.length, die.shown?.[index]));
      }
    }
    if (laid.length > 0) SoundEffect.play(PresetSound.dicePut);
    return laid;
  }

  /**
   * Takes a die off the table and onto the character's sheet.
   *
   * The die itself goes: what is kept is its name, its faces and how many there are, and
   * leaving the object behind as well would put the same die in two places. One the sheet
   * could not keep stays where it stands, rather than being lost between the two.
   */
  store(character: GameCharacter, symbol: DiceSymbol): void {
    if (this.take(character, symbol)) SoundEffect.play(PresetSound.sweep);
  }

  private take(character: GameCharacter, symbol: DiceSymbol): boolean {
    if (!storeHeldDie(character, heldDieOfSymbol(symbol))) return false;
    symbol.destroy();
    return true;
  }

  /** Puts one back onto the sheet without a die on the table to take it from. */
  discard(character: GameCharacter, name: string): void {
    removeHeldDie(character, name);
  }

  private layOut(character: GameCharacter, die: HeldDie, index: number, shown: string | undefined): DiceSymbol {
    const symbol = DiceSymbol.create(die.name, DiceType.D6, 1);
    this.applyFaces(symbol, die, shown);

    symbol.ownerCharacterIdentifier = character.identifier;
    symbol.location.name = 'table';
    symbol.location.x = character.location.x + DICE_OFFSET_PX + index * DICE_STEP_PX;
    symbol.location.y = character.location.y + DICE_OFFSET_PX;
    symbol.posZ = character.posZ;
    symbol.update();
    return symbol;
  }

  /**
   * The faces come from the sheet, so a die of any number of sides is laid out as it was kept.
   *
   * It comes out on the face it was left on. A set put away mid-scene is the same set when
   * it comes back, and a face the die no longer has falls back to its first.
   */
  private applyFaces(symbol: DiceSymbol, die: HeldDie, shown: string | undefined): void {
    const images = symbol.imageDataElement;
    if (!images) return;

    for (const face of [...images.children]) face.destroy();
    for (const face of die.faces) {
      images.appendChild(DataElement.create(face.label, face.imageIdentifier, { type: 'image' }));
    }
    const labels = die.faces.map((face) => face.label);
    symbol.face = shown && labels.includes(shown) ? shown : labels[0];
  }
}
