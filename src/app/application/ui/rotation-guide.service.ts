import { computed, Injectable, signal } from '@angular/core';

/** A turn under way, as the screen reads it out. */
export interface TurnInProgress {
  /** The angle it stands at, in whole degrees from 0 to 359. */
  readonly angle: number;
  /** The step a held snap brings it to, in degrees. */
  readonly step: number;
  /** Whether it is being snapped to that step now. */
  readonly snapping: boolean;
}

/**
 * The turn this reader is giving something on the table, so the screen can say how far it has gone
 * and how to snap it while it is under way.
 *
 * Whatever is being turned reports itself, and only what reported a turn can end it, so a press
 * cancelled on something else never clears a turn still in hand.
 */
@Injectable({ providedIn: 'root' })
export class RotationGuideService {
  private readonly current = signal<{ readonly owner: object; readonly turn: TurnInProgress } | null>(null);

  /** The turn under way, or null when nothing is being turned. */
  readonly turn = computed<TurnInProgress | null>(() => this.current()?.turn ?? null);

  /** Says where a turn under way stands. */
  report(owner: object, turn: TurnInProgress): void {
    this.current.set({ owner, turn });
  }

  /** Ends the turn the owner reported, if it is still the one under way. */
  end(owner: object): void {
    if (this.current()?.owner === owner) this.current.set(null);
  }
}
