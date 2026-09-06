import { Injectable, signal } from '@angular/core';
import {
  normalizeTabletopDisplayOwn,
  TabletopDisplayOwn,
  TabletopDisplaySettings,
} from '@axe/domain/tabletop/tabletop-display';

export const SEAT_DISPLAY_OVERRIDE_STORAGE_KEY = 'ui-tabletop-display-override';

/**
 * How the screen in front of this reader draws a table laid flat.
 *
 * A group around one screen sets it on that screen, and the people joining the same session
 * from somewhere else are left alone: none of it reaches the room. It is written down here
 * rather than in the room for that reason, and because it describes this glass.
 */
@Injectable({ providedIn: 'root' })
export class SeatDisplayPreferenceService {
  private readonly state = signal<TabletopDisplayOwn>(stored());

  /** Only what this screen has been told; anything else is still the table's to answer. */
  readonly own = this.state.asReadonly();

  set(patch: Partial<TabletopDisplaySettings>): void {
    this.write({ ...this.state(), ...patch });
  }

  /** Back to whatever the table says, which is where a screen starts. */
  forget(): void {
    this.write({});
  }

  private write(next: TabletopDisplayOwn): void {
    const normalized = normalizeTabletopDisplayOwn(next);
    this.state.set(normalized);
    try {
      localStorage.setItem(SEAT_DISPLAY_OVERRIDE_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage can be unavailable in private mode; the signal still serves this session.
    }
  }
}

function stored(): TabletopDisplayOwn {
  try {
    const raw = localStorage.getItem(SEAT_DISPLAY_OVERRIDE_STORAGE_KEY);
    return normalizeTabletopDisplayOwn(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}
