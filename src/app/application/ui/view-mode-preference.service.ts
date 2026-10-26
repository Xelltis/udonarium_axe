import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { asViewMode, DEFAULT_VIEW_MODE, ViewMode } from '@axe/domain/ui/view-mode';

/**
 * Whether this reader looks along the table or straight down on it.
 *
 * Kept here rather than in the room, since it is a way of looking rather than a decision
 * about the table: one player wanting a flat board does not put everyone else on one.
 */
@Injectable({ providedIn: 'root' })
export class ViewModePreferenceService {
  readonly mode = signal<ViewMode>(stored());

  /** Chooses how this reader looks at the table and writes it down in this browser. */
  choose(mode: ViewMode): void {
    this.mode.set(mode);
    writeLocal(STORAGE_KEYS.viewMode, mode);
  }
}

function stored(): ViewMode {
  return asViewMode(readLocal(STORAGE_KEYS.viewMode)) ?? DEFAULT_VIEW_MODE;
}
