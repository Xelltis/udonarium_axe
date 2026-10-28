import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { type BuffIconScale, nextBuffIconScale, readBuffIconScale } from '@axe/domain/character/buff-icon-scale';
import { type BuffViewMode, isBuffViewMode, nextBuffViewMode } from '@axe/domain/character/buff-view-mode';

@Injectable({ providedIn: 'root' })
export class BuffViewPreferenceService {
  readonly mode = signal<BuffViewMode>(storedMode());
  /** How large this reader has the buff icons over a piece drawn, in percent of their usual size. */
  readonly iconScale = signal<BuffIconScale>(readBuffIconScale(readLocal(STORAGE_KEYS.buffIconScale)));

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

  /** Moves the buff icons on to their next size, and remembers it. */
  cycleIconScale(): void {
    this.setIconScale(nextBuffIconScale(this.iconScale()));
  }

  /**
   * Chooses how large the buff icons are drawn and writes it to localStorage. Where storage refuses,
   * it still holds for this session.
   */
  setIconScale(scale: BuffIconScale): void {
    this.iconScale.set(scale);
    writeLocal(STORAGE_KEYS.buffIconScale, String(scale));
  }
}

function storedMode(): BuffViewMode {
  const stored = readLocal(STORAGE_KEYS.buffView);
  return isBuffViewMode(stored) ? stored : 'icon';
}
