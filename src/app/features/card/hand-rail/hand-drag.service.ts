import { Injectable, signal } from '@angular/core';
import { Card } from '@axe/domain/card/card';

@Injectable({ providedIn: 'root' })
export class HandDragService {
  readonly card = signal<Card | null>(null);
  readonly x = signal(0);
  readonly y = signal(0);
  readonly tableCard = signal<Card | null>(null);

  /**
   * Starts carrying a card out of the hand rail, with the drag ghost drawn at the given viewport
   * point.
   */
  begin(card: Card, x = 0, y = 0): void {
    this.card.set(card);
    this.x.set(x);
    this.y.set(y);
  }

  /** Moves the drag ghost of the carried hand card to a new viewport point. */
  move(x: number, y: number): void {
    this.x.set(x);
    this.y.set(y);
  }

  /** Stops carrying a hand card, which takes the drag ghost away. */
  end(): void {
    this.card.set(null);
  }

  /**
   * Marks a card from the table as being dragged, so the hand rail lights up as a place it can drop
   * into.
   */
  armTableDrag(card: Card): void {
    this.tableCard.set(card);
  }

  /** Clears the table card being dragged, turning the hand rail's highlight off. */
  disarmTableDrag(): void {
    this.tableCard.set(null);
  }
}
