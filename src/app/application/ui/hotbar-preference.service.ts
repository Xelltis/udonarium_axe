import { Injectable, signal } from '@angular/core';
import { HOTBAR_PAGES } from '@axe/domain/hotbar/hotbar-size';

const STORAGE_KEY = 'ui-hotbar';

interface HotbarPreference {
  page: number;
  /** Held where it stands, so a press cannot drag it about. */
  locked: boolean;
  /** Drawn above everything, the modal included. */
  pinned: boolean;
  showsLabel: boolean;
  showsHint: boolean;
}

const DEFAULT_PREFERENCE: HotbarPreference = {
  page: 0,
  locked: false,
  pinned: false,
  showsLabel: true,
  showsHint: true,
};

@Injectable({ providedIn: 'root' })
export class HotbarPreferenceService {
  private readonly held = signal<HotbarPreference>(storedPreference());

  readonly page = () => this.held().page;
  readonly locked = () => this.held().locked;
  readonly pinned = () => this.held().pinned;
  readonly showsLabel = () => this.held().showsLabel;
  readonly showsHint = () => this.held().showsHint;

  /**
   * Shows a page of the hotbar, clamped to the pages there are, and remembers it. A non-finite page
   * is ignored.
   */
  gotoPage(page: number): void {
    if (!Number.isFinite(page)) return;
    this.write({ page: Math.min(HOTBAR_PAGES - 1, Math.max(0, Math.floor(page))) });
  }

  /** Turns the hotbar by a number of pages, wrapping round past either end. */
  turnPage(step: number): void {
    this.gotoPage((this.page() + step + HOTBAR_PAGES) % HOTBAR_PAGES);
  }

  /** Holds the hotbar where it stands, or lets it be dragged again. Remembered in this browser. */
  setLocked(locked: boolean): void {
    this.write({ locked });
  }

  /**
   * Draws the hotbar above everything, modals included, or back among the rest. Remembered in this
   * browser.
   */
  setPinned(pinned: boolean): void {
    this.write({ pinned });
  }

  /** Whether hotbar slots show their labels. Remembered in this browser. */
  setShowsLabel(showsLabel: boolean): void {
    this.write({ showsLabel });
  }

  /**
   * Whether the hotbar shows its keyboard shortcut hint: a line of small text beside the page
   * buttons above the slots, saying that the number keys fire slots, Shift and a number picks a
   * page, and `[` `]` turn the page.
   *
   * It is never drawn in the mobile layout, and a failure message takes its place while one is
   * shown. Remembered in this browser.
   */
  setShowsHint(showsHint: boolean): void {
    this.write({ showsHint });
  }

  private write(patch: Partial<HotbarPreference>): void {
    const next = { ...this.held(), ...patch };
    this.held.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing refuses the write; the setting still holds for this session.
    }
  }
}

function storedPreference(): HotbarPreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_PREFERENCE };
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PREFERENCE };
    const held = parsed as Record<string, unknown>;
    const page = Number(held.page);
    return {
      page: Number.isFinite(page) ? Math.min(HOTBAR_PAGES - 1, Math.max(0, Math.floor(page))) : 0,
      locked: held.locked === true,
      pinned: held.pinned === true,
      showsLabel: held.showsLabel !== false,
      showsHint: held.showsHint !== false,
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}
