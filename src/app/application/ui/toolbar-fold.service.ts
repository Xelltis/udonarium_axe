import { Injectable, signal } from '@angular/core';

/** Where this seat's own choice is kept in the browser. */
export const TOOLBAR_FOLD_STORAGE_KEY = 'ui-toolbars';

const STORAGE_KEY = TOOLBAR_FOLD_STORAGE_KEY;

/** The toolbars a seat can fold away: the player's and the game master's. */
export type FoldableToolbar = 'pl' | 'gm';

type ToolbarFolds = Readonly<Record<FoldableToolbar, boolean>>;

const ALL_OPEN: ToolbarFolds = { pl: false, gm: false };

/**
 * Which toolbars this seat has folded down to their titles.
 *
 * A toolbar starts open, and is kept folded or open in this browser from then on. What cannot be
 * read back, or a browser that will not keep it, leaves every toolbar open.
 */
@Injectable({ providedIn: 'root' })
export class ToolbarFoldService {
  private readonly folds = signal<ToolbarFolds>(storedFolds());

  /** Whether a toolbar is folded down to its title. */
  isFolded(toolbar: FoldableToolbar): boolean {
    return this.folds()[toolbar];
  }

  /** Folds a toolbar that is open, or opens one that is folded, and remembers it. */
  toggle(toolbar: FoldableToolbar): void {
    const next = { ...this.folds(), [toolbar]: !this.folds()[toolbar] };
    this.folds.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing refuses the write; the fold still holds for this session.
    }
  }
}

function storedFolds(): ToolbarFolds {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return ALL_OPEN;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return ALL_OPEN;
    const held = parsed as Record<string, unknown>;
    return { pl: held['pl'] === true, gm: held['gm'] === true };
  } catch {
    return ALL_OPEN;
  }
}
