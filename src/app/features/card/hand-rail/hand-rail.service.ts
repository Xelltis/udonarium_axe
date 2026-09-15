import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class HandRailService {
  readonly isOpen = signal(false);

  /** Shows this user's hand rail. */
  open(): void {
    this.isOpen.set(true);
  }

  /** Hides this user's hand rail. */
  close(): void {
    this.isOpen.set(false);
  }

  /**
   * Shows the hand rail if it is hidden and hides it if it is showing, from the toolbar and mobile
   * menu buttons.
   */
  toggle(): void {
    this.isOpen.update((open) => !open);
  }
}
