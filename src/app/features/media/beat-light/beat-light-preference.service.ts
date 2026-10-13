import { Injectable, signal } from '@angular/core';

/** Where whether this browser keeps the beat light off is kept. */
export const BEAT_LIGHT_OFF_STORAGE_KEY = 'beat-light-off';

/**
 * Whether the reader keeps the beat light off on their own screen, whatever the room says,
 * remembered in this browser.
 */
@Injectable({ providedIn: 'root' })
export class BeatLightPreferenceService {
  private readonly _off = signal(readOff());

  /** Whether the beat light is kept off here. */
  readonly off = this._off.asReadonly();

  /** Keeps the beat light off here, or lets it show again, and remembers which. */
  setOff(off: boolean): void {
    this._off.set(off);
    try {
      localStorage.setItem(BEAT_LIGHT_OFF_STORAGE_KEY, off ? '1' : '');
    } catch {
      // Private browsing refuses the write; the choice still holds for this session.
    }
  }
}

function readOff(): boolean {
  try {
    return localStorage.getItem(BEAT_LIGHT_OFF_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
