import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/**
 * Whether this screen shows the battle stage when an exchange is played.
 *
 * Each person decides for their own screen and the choice stays in their browser. It starts on,
 * since the stage is something the room plays for everybody; turning it off plays the blow on the
 * table instead.
 */
@Injectable({ providedIn: 'root' })
export class BattleCutInPreferenceService {
  private readonly _shown = signal(readLocal(STORAGE_KEYS.battleCutIn) !== 'off');
  readonly shown = this._shown.asReadonly();

  /** Shows or hides the battle stage on this screen, and remembers it in this browser. */
  setShown(shown: boolean): void {
    this._shown.set(shown);
    writeLocal(STORAGE_KEYS.battleCutIn, shown ? 'on' : 'off');
  }

  /** Flips whether this screen shows the battle stage, and remembers it. */
  toggle(): void {
    this.setShown(!this._shown());
  }
}
