import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NpcBarService {
  readonly isOpen = signal(false);

  /** Shows the game master's NPC bar. */
  open(): void {
    this.isOpen.set(true);
  }

  /** Puts the NPC bar away. */
  close(): void {
    this.isOpen.set(false);
  }

  /** Shows the NPC bar, or puts it away when it is already showing, from the GM toolbar. */
  toggle(): void {
    this.isOpen.update((v) => !v);
  }
}
