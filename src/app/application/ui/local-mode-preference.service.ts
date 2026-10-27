import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/**
 * Whether this browser runs the room on its own, without SkyWay or a backend.
 *
 * It is a way of starting rather than a state of the room, so it is read once as the app comes
 * up and takes effect on the next load. Kept in this browser, since a screen that has no
 * network to speak of is a fact about the machine, not about anybody it might have joined.
 */
@Injectable({ providedIn: 'root' })
export class LocalModePreferenceService {
  readonly enabled = signal<boolean>(stored());

  /** Turns local mode on or off in this browser. It takes effect on the next load, not now. */
  set(enabled: boolean): void {
    this.enabled.set(enabled);
    writeLocal(STORAGE_KEYS.localMode, enabled ? '1' : null);
  }
}

function stored(): boolean {
  return readLocal(STORAGE_KEYS.localMode) === '1';
}
