import { Injectable, signal } from '@angular/core';
import { GameCharacter } from '@axe/domain/character/game-character';

/**
 * A character being carried from a list toward the NPC bar, which the bar lights up for.
 *
 * Only the hand-over is kept here; the list the character is carried from draws it beside the
 * pointer itself.
 */
@Injectable({ providedIn: 'root' })
export class NpcDragService {
  readonly character = signal<GameCharacter | null>(null);

  /** Starts carrying a character from a list toward the NPC bar. */
  begin(character: GameCharacter): void {
    this.character.set(character);
  }

  /**
   * Stops carrying the character.
   *
   * When it was let go over the NPC bar the character is marked as an NPC, a change the whole room
   * sees; a character already marked is left as it is. Either way nothing is carried afterwards.
   */
  end(register: boolean): void {
    const character = this.character();
    if (register && character && !character.isNpc) {
      character.isNpc = true;
      character.update();
    }
    this.character.set(null);
  }
}
