import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

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
    writeLocal(STORAGE_KEYS.beatLightOff, off ? '1' : '');
  }
}

function readOff(): boolean {
  return readLocal(STORAGE_KEYS.beatLightOff) === '1';
}
