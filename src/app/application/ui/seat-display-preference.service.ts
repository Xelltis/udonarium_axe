import { Injectable, signal } from '@angular/core';
import {
  normalizeTabletopDisplayOverride,
  overridesSection,
  pickSection,
  TabletopDisplayOverride,
  TabletopDisplaySection,
  TabletopDisplaySettings,
  withoutSection,
} from '@axe/domain/tabletop/tabletop-display';

export const SEAT_DISPLAY_OVERRIDE_STORAGE_KEY = 'ui-tabletop-display-override';

/**
 * The features of the flat table this reader has taken over from the table.
 *
 * A group around one screen laid flat wants the same thing on it, so the table decides. A reader
 * on a laptop at the same session wants their own, so they may take a feature over, one feature
 * at a time. What is taken over is written down here rather than in the room, since it describes
 * the glass in front of this browser.
 */
@Injectable({ providedIn: 'root' })
export class SeatDisplayPreferenceService {
  private readonly state = signal<TabletopDisplayOverride>(stored());

  readonly override = this.state.asReadonly();

  takesOver(section: TabletopDisplaySection): boolean {
    return overridesSection(this.state(), section);
  }

  /** Takes the feature over, starting from what the table currently asks for. */
  takeOver(section: TabletopDisplaySection, from: TabletopDisplaySettings): void {
    this.write({ ...this.state(), ...pickSection(from, section) });
  }

  handBack(section: TabletopDisplaySection): void {
    this.write(withoutSection(this.state(), section));
  }

  /** Changes settings this reader already speaks for; keys of a feature left to the table are ignored. */
  patch(patch: Partial<TabletopDisplaySettings>): void {
    const current = this.state();
    const next: TabletopDisplayOverride = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in current)) continue;
      (next as Record<string, unknown>)[key] = value;
    }
    this.write(next);
  }

  private write(next: TabletopDisplayOverride): void {
    const normalized = normalizeTabletopDisplayOverride(next);
    this.state.set(normalized);
    try {
      localStorage.setItem(SEAT_DISPLAY_OVERRIDE_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage can be unavailable in private mode; the signal still serves this session.
    }
  }
}

function stored(): TabletopDisplayOverride {
  try {
    const raw = localStorage.getItem(SEAT_DISPLAY_OVERRIDE_STORAGE_KEY);
    return normalizeTabletopDisplayOverride(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}
