import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/** Whose turn this reader's view glides to as it begins: everyone's, their own characters' alone, or none. */
export type TurnFocusSetting = 'all' | 'own' | 'none';

const TURN_FOCUS_ORDER: readonly TurnFocusSetting[] = ['all', 'own', 'none'];

/**
 * Whether this reader's view glides to the piece whose turn begins.
 *
 * A way of looking rather than a rule of the room, so it is this browser's alone. On for every
 * turn until the reader says otherwise: the master follows the pieces they move, and a player the
 * fight as it goes round.
 */
@Injectable({ providedIn: 'root' })
export class TurnFocusPreferenceService {
  readonly setting = signal<TurnFocusSetting>(storedSetting());

  /** Moves the setting on through every turn, one's own alone and none, writing the choice down. */
  cycle(): void {
    const index = TURN_FOCUS_ORDER.indexOf(this.setting());
    this.set(TURN_FOCUS_ORDER[(index + 1) % TURN_FOCUS_ORDER.length]);
  }

  set(setting: TurnFocusSetting): void {
    this.setting.set(setting);
    writeLocal(STORAGE_KEYS.turnFocus, setting);
  }
}

function storedSetting(): TurnFocusSetting {
  const stored = readLocal(STORAGE_KEYS.turnFocus);
  return TURN_FOCUS_ORDER.includes(stored as TurnFocusSetting) ? (stored as TurnFocusSetting) : 'all';
}
