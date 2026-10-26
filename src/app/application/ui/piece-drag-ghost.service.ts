import { Injectable, signal } from '@angular/core';
import { GameCharacter } from '@axe/domain/character/game-character';

/**
 * The piece drawn beside the pointer while one is carried out of a list, so the reader sees what
 * they hold and how many go with it.
 *
 * One for the whole screen, drawn above every panel: whichever list started the carry says where
 * the pointer is.
 */
@Injectable({ providedIn: 'root' })
export class PieceDragGhostService {
  readonly character = signal<GameCharacter | null>(null);
  /** How many pieces travel together, the one drawn among them. */
  readonly count = signal(1);
  readonly x = signal(0);
  readonly y = signal(0);

  /** Starts drawing a piece beside the pointer, with how many travel along with it. */
  show(character: GameCharacter, x: number, y: number, count = 1): void {
    this.character.set(character);
    this.count.set(count);
    this.x.set(x);
    this.y.set(y);
  }

  /** Follows the pointer while a piece is drawn. */
  move(x: number, y: number): void {
    this.x.set(x);
    this.y.set(y);
  }

  /** Stops drawing the piece. */
  hide(): void {
    this.character.set(null);
    this.count.set(1);
  }
}
