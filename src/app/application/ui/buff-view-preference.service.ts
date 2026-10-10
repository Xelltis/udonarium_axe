import { Injectable, signal } from '@angular/core';
import { type BuffViewMode, isBuffViewMode, nextBuffViewMode } from '@axe/domain/character/buff-view-mode';

const STORAGE_KEY = 'ui-buff-view';

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
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private browsing refuses the write; the setting still holds for this session.
    }
  }
}

function storedMode(): BuffViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isBuffViewMode(stored) ? stored : 'icon';
  } catch {
    return 'icon';
  }
}
