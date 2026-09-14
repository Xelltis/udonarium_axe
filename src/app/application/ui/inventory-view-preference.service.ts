import { Injectable, signal } from '@angular/core';
import {
  formatHiddenChromeParts,
  type InventoryChromePart,
  parseHiddenChromeParts,
} from '@axe/domain/inventory/inventory-chrome';
import { type InventoryViewMode, isInventoryViewMode } from '@axe/domain/inventory/inventory-view-mode';

const STORAGE_KEY = 'ui-inventory-view';
const PARTS_STORAGE_KEY = 'ui-inventory-parts';

/**
 * How this reader wants an inventory drawn.
 *
 * Kept here rather than in the room, since it is a way of looking rather than a decision about
 * the table: one player squinting at twelve enemies wants the table where another wants the
 * gauges.
 *
 * An inventory window keeps one of these of its own, so a second window can be read another
 * way. What is written down is the last choice made, which is where the next window starts.
 */
@Injectable({ providedIn: 'root' })
export class InventoryViewPreferenceService {
  readonly mode = signal<InventoryViewMode>(storedMode());

  /** The strips above the list this reader has put away. Everything is shown by default. */
  private readonly hidden = signal<readonly InventoryChromePart[]>(storedHiddenParts());

  /**
   * Chooses how an inventory is drawn and writes it down as where the next inventory window starts.
   */
  set(mode: InventoryViewMode): void {
    this.mode.set(mode);
    write(STORAGE_KEY, mode);
  }

  /**
   * Whether a strip above the inventory list is shown. Every strip is, until the reader puts it
   * away.
   */
  shows(part: InventoryChromePart): boolean {
    return !this.hidden().includes(part);
  }

  /**
   * Shows or puts away one strip above the inventory list, remembering the choice in this browser.
   */
  setShown(part: InventoryChromePart, shown: boolean): void {
    const hidden = this.hidden().filter((held) => held !== part);
    const next = shown ? hidden : [...hidden, part];
    this.hidden.set(next);
    write(PARTS_STORAGE_KEY, formatHiddenChromeParts(next));
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing refuses the write; the setting still holds for this session.
  }
}

function storedMode(): InventoryViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isInventoryViewMode(stored) ? stored : 'rich';
  } catch {
    return 'rich';
  }
}

function storedHiddenParts(): InventoryChromePart[] {
  try {
    return parseHiddenChromeParts(localStorage.getItem(PARTS_STORAGE_KEY));
  } catch {
    return [];
  }
}
