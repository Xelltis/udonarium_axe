import { Injectable, signal } from '@angular/core';

/**
 * Which tab of each character's palette this reader has open, kept while the page is, so that a
 * palette closed and opened again, or swapped for another character's and back, opens where it was.
 */
@Injectable({ providedIn: 'root' })
export class ChatPaletteTabService {
  private readonly chosen = signal<ReadonlyMap<string, number>>(new Map());

  /** The tab open in a character's palette, the first until another is chosen. */
  tabOf(identifier: string): number {
    return this.chosen().get(identifier) ?? 0;
  }

  /** Opens a tab of a character's palette. */
  choose(identifier: string, index: number): void {
    this.chosen.update((chosen) => new Map(chosen).set(identifier, index));
  }
}
