import { Injectable, signal } from '@angular/core';
import { Network } from '@axe/core/network/network';

/**
 * Whether the seat was let out of its room on a room server for the page left alone, and the way
 * back in, which only its reader takes: nothing takes the seat back in by itself.
 */
@Injectable({ providedIn: 'root' })
export class IdleSeatService {
  private readonly _leftAlone = signal(false);

  /** Whether the seat is out of its room for the page left alone, until it goes back in. */
  readonly leftAlone = this._leftAlone.asReadonly();

  /** Takes the seat as let out, for the way back in to be offered. */
  markLeft(): void {
    this._leftAlone.set(true);
  }

  /** Takes the seat let out back into its room, on the same peer id. */
  comeBack(): void {
    if (!this._leftAlone()) return;
    this._leftAlone.set(false);
    Network.comeBackFromIdle();
  }
}
