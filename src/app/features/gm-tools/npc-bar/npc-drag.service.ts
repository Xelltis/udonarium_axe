import { inject, Injectable, signal } from '@angular/core';
import { PieceDragGhostService } from '@axe/application/ui/piece-drag-ghost.service';
import { GameCharacter } from '@axe/domain/character/game-character';

@Injectable({ providedIn: 'root' })
export class NpcDragService {
  private readonly ghost = inject(PieceDragGhostService);

  readonly character = signal<GameCharacter | null>(null);

  /**
   * Starts carrying a character from a list toward the NPC bar, from where the pointer is, drawing
   * it beside the pointer.
   */
  begin(character: GameCharacter, x = 0, y = 0): void {
    this.character.set(character);
    this.ghost.show(character, x, y);
  }

  /** Follows the pointer while a character is being carried. */
  move(x: number, y: number): void {
    this.ghost.move(x, y);
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
    this.ghost.hide();
  }
}
