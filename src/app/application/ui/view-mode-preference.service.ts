import { Injectable, signal } from '@angular/core';
import { asViewMode, DEFAULT_VIEW_MODE, ViewMode } from '@axe/domain/ui/view-mode';

export const VIEW_MODE_STORAGE_KEY = 'ui-view-mode';

/**
 * Whether this reader looks along the table or straight down on it.
 *
 * Kept here rather than in the room, since it is a way of looking rather than a decision
 * about the table: one player wanting a flat board does not put everyone else on one.
 */
@Injectable({ providedIn: 'root' })
export class ViewModePreferenceService {
  readonly mode = signal<ViewMode>(stored());

  choose(mode: ViewMode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Private browsing refuses the write; the choice still holds for this session.
    }
  }
}

function stored(): ViewMode {
  try {
    return asViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY)) ?? DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}
