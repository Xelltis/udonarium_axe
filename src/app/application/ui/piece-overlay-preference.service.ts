import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/** What this seat draws over the pieces on the table. */
interface PieceOverlay {
  readonly names: boolean;
  readonly resourceBars: boolean;
  readonly buffs: boolean;
  readonly speech: boolean;
}

const SHOW_ALL: PieceOverlay = { names: true, resourceBars: true, buffs: true, speech: true };

/**
 * Whether this seat draws the names, the resource bars, the buffs and what the characters say over
 * the pieces on the table.
 *
 * A switch for this screen alone, flipped from the toolbar whenever the table is too busy to read,
 * and kept in this browser. Nothing on the pieces changes, so every other seat still sees what it
 * chose. All start shown, and whatever cannot be read back leaves them shown.
 */
@Injectable({ providedIn: 'root' })
export class PieceOverlayPreferenceService {
  private readonly held = signal<PieceOverlay>(storedOverlay());

  readonly names = () => this.held().names;
  readonly resourceBars = () => this.held().resourceBars;
  readonly buffs = () => this.held().buffs;
  readonly speech = () => this.held().speech;

  /** Shows the names over the pieces if they are hidden, or hides them. */
  toggleNames(): void {
    this.write({ ...this.held(), names: !this.held().names });
  }

  /** Shows the resource bars over the pieces if they are hidden, or hides them. */
  toggleResourceBars(): void {
    this.write({ ...this.held(), resourceBars: !this.held().resourceBars });
  }

  /** Shows the buffs over the pieces if they are hidden, or hides them. */
  toggleBuffs(): void {
    this.write({ ...this.held(), buffs: !this.held().buffs });
  }

  /** Shows what the characters say over their pieces if it is hidden, or hides it. */
  toggleSpeech(): void {
    this.write({ ...this.held(), speech: !this.held().speech });
  }

  private write(next: PieceOverlay): void {
    this.held.set(next);
    writeLocal(STORAGE_KEYS.pieceOverlay, JSON.stringify(next));
  }
}

function storedOverlay(): PieceOverlay {
  try {
    const stored = readLocal(STORAGE_KEYS.pieceOverlay);
    if (!stored) return SHOW_ALL;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return SHOW_ALL;
    const held = parsed as Record<string, unknown>;
    return {
      names: held['names'] !== false,
      resourceBars: held['resourceBars'] !== false,
      buffs: held['buffs'] !== false,
      speech: held['speech'] !== false,
    };
  } catch {
    return SHOW_ALL;
  }
}
