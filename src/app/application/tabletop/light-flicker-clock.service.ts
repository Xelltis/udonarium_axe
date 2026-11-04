import { Injectable, signal, untracked } from '@angular/core';

/**
 * The moment the flickering lights of the table are drawn at: the clock's, unless held at one
 * moment for pictures of the table that must come out the same however long the page took to get
 * there. The darkness the page draws and the scene a canvas draws both read it, so a torch flickers
 * alike on either.
 */
@Injectable({ providedIn: 'root' })
export class LightFlickerClockService {
  private readonly heldAt = signal<number | null>(null);

  /** The moment the lights are held at, or null while they flicker by the clock. */
  readonly held = this.heldAt.asReadonly();

  /** The moment to draw the flickering lights at now. */
  now(): number {
    return untracked(this.heldAt) ?? performance.now();
  }

  /** Holds the flickering lights at a moment, or lets them flicker by the clock again given null. */
  hold(timeMs: number | null): void {
    this.heldAt.set(timeMs);
  }
}
