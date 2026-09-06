import { Injectable, signal } from '@angular/core';

/**
 * Whether the table refuses to be panned, zoomed or turned.
 *
 * A display lying flat with miniatures on it is touched all the time without anybody meaning to
 * move the view, so the lock is held per client and never shared: locking the table under the
 * miniatures says nothing about the laptop across the room. Nor is it written down - it says
 * what this screen is being used for right now, and a board that comes back locked in another
 * room simply looks broken.
 */
@Injectable({ providedIn: 'root' })
export class ViewLockService {
  readonly locked = signal<boolean>(false);

  toggle(): void {
    this.set(!this.locked());
  }

  set(locked: boolean): void {
    this.locked.set(locked);
  }
}
