import { Injectable, signal } from '@angular/core';

/**
 * Whether trying to reach the network has been given up on, every retry having failed, so that what
 * waits on a connection, as an invitation does, can say it will not come rather than wait for it.
 */
@Injectable({ providedIn: 'root' })
export class NetworkReachService {
  private readonly _unreachable = signal(false);

  /** True once the retries have run out, until a connection opens. */
  readonly unreachable = this._unreachable.asReadonly();

  /** Says the retries have run out. */
  giveUp(): void {
    this._unreachable.set(true);
  }

  /** Says a connection has opened. */
  reached(): void {
    this._unreachable.set(false);
  }
}
