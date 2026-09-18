import { Injectable, signal } from '@angular/core';

/** Where this seat's own choice is kept in the browser. */
export const PIECE_OVERLAY_STORAGE_KEY = 'ui-piece-overlay';

const STORAGE_KEY = PIECE_OVERLAY_STORAGE_KEY;

/** What this seat draws over the pieces on the table. */
interface PieceOverlay {
  readonly resourceBars: boolean;
  readonly buffs: boolean;
}

const SHOW_ALL: PieceOverlay = { resourceBars: true, buffs: true };

/**
 * Whether this seat draws the resource bars and the buffs over the pieces on the table.
 *
 * A switch for this screen alone, flipped from the toolbar whenever the table is too busy to read,
 * and kept in this browser. Nothing on the pieces changes, so every other seat still sees what it
 * chose. Both start shown, and whatever cannot be read back leaves them shown.
 */
@Injectable({ providedIn: 'root' })
export class PieceOverlayPreferenceService {
  private readonly held = signal<PieceOverlay>(storedOverlay());

  readonly resourceBars = () => this.held().resourceBars;
  readonly buffs = () => this.held().buffs;

  /** Shows the resource bars over the pieces if they are hidden, or hides them. */
  toggleResourceBars(): void {
    this.write({ ...this.held(), resourceBars: !this.held().resourceBars });
  }

  /** Shows the buffs over the pieces if they are hidden, or hides them. */
  toggleBuffs(): void {
    this.write({ ...this.held(), buffs: !this.held().buffs });
  }

  private write(next: PieceOverlay): void {
    this.held.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing refuses the write; the switch still holds for this session.
    }
  }
}

function storedOverlay(): PieceOverlay {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return SHOW_ALL;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return SHOW_ALL;
    const held = parsed as Record<string, unknown>;
    return { resourceBars: held['resourceBars'] !== false, buffs: held['buffs'] !== false };
  } catch {
    return SHOW_ALL;
  }
}
