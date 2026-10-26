import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { type BuffViewMode, isBuffViewMode, nextBuffViewMode } from '@axe/domain/character/buff-view-mode';

@Injectable({ providedIn: 'root' })
export class BuffViewPreferenceService {
  readonly mode = signal<BuffViewMode>(storedMode());

  /** Moves the buff display on to its next way of drawing buffs, and remembers the choice. */
  cycle(): void {
    this.set(nextBuffViewMode(this.mode()));
  }

  /**
   * Chooses how buffs are drawn and writes it to localStorage. Where storage refuses, it still
   * holds for this session.
   */
  set(mode: BuffViewMode): void {
    this.mode.set(mode);
    writeLocal(STORAGE_KEYS.buffView, mode);
  }
}

function storedMode(): BuffViewMode {
  const stored = readLocal(STORAGE_KEYS.buffView);
  return isBuffViewMode(stored) ? stored : 'icon';
}
