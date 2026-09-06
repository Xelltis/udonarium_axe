import { Injectable, signal } from '@angular/core';

export const LOCAL_MODE_STORAGE_KEY = 'ui-local-mode';

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

  set(enabled: boolean): void {
    this.enabled.set(enabled);
    try {
      if (enabled) localStorage.setItem(LOCAL_MODE_STORAGE_KEY, '1');
      else localStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
    } catch {
      // Private browsing refuses the write; the choice still holds for this session.
    }
  }
}

function stored(): boolean {
  try {
    return localStorage.getItem(LOCAL_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
