import { Injectable, signal, WritableSignal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import {
  formatHiddenChromeParts,
  type InventoryChromePart,
  parseHiddenChromeParts,
} from '@axe/domain/inventory/inventory-chrome';
import { type InventoryViewMode, isInventoryViewMode } from '@axe/domain/inventory/inventory-view-mode';

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
   * Whether an inventory opens with its folders folded up.
   *
   * A room of a dozen folders opens as a wall of names, and the reader wanting one of them has
   * to fold the others away before they can see it. Left off, every folder opens as it always
   * has, which is what a room of two folders wants.
   */
  readonly foldsOnOpen = signal<boolean>(storedFlag(STORAGE_KEYS.inventoryFolded));

  /**
   * Chooses how an inventory is drawn and writes it down as where the next inventory window starts.
   */
  set(mode: InventoryViewMode): void {
    this.mode.set(mode);
    writeLocal(STORAGE_KEYS.inventoryView, mode);
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
    writeLocal(STORAGE_KEYS.inventoryParts, formatHiddenChromeParts(next));
  }

  /** Says whether an inventory opens folded up, and writes it down for the next one. */
  setFoldsOnOpen(folds: boolean): void {
    setStoredFlag(this.foldsOnOpen, STORAGE_KEYS.inventoryFolded, folds);
  }

  /**
   * Whether a search box stands above the list itself, beside the one in the display settings.
   * Off until the reader asks for it, so an inventory reads as it always has.
   */
  readonly searchBar = signal<boolean>(storedFlag(STORAGE_KEYS.inventorySearchBar));

  /** Puts the search box above the list or takes it away, and writes it down for the next window. */
  setSearchBar(shown: boolean): void {
    setStoredFlag(this.searchBar, STORAGE_KEYS.inventorySearchBar, shown);
  }

  /**
   * Whether the round's strip waits for a round to begin, leaving a button beside the tabs to begin
   * one. Off until the reader asks for it, so the strip stands where it always has.
   */
  readonly roundInPlay = signal<boolean>(storedFlag(STORAGE_KEYS.inventoryRoundInPlay));

  /** Says whether the round's strip waits for a round to begin, and writes it down for the next window. */
  setRoundInPlay(waits: boolean): void {
    setStoredFlag(this.roundInPlay, STORAGE_KEYS.inventoryRoundInPlay, waits);
  }

  /**
   * Whether the rows of the rich view fold down to a name and thin gauges until one is picked. Off
   * until the reader asks for it, so every row opens out as it always has.
   */
  readonly compact = signal<boolean>(storedFlag(STORAGE_KEYS.inventoryCompact));

  /** Says whether the rows of the rich view fold down, and writes it down for the next window. */
  setCompact(compact: boolean): void {
    setStoredFlag(this.compact, STORAGE_KEYS.inventoryCompact, compact);
  }
}

/** Sets a yes-or-no and writes it down in this browser: '1' for yes, nothing for no. */
function setStoredFlag(flag: WritableSignal<boolean>, key: string, on: boolean): void {
  flag.set(on);
  writeLocal(key, on ? '1' : '');
}

function storedMode(): InventoryViewMode {
  const stored = readLocal(STORAGE_KEYS.inventoryView);
  return isInventoryViewMode(stored) ? stored : 'rich';
}

function storedFlag(key: string): boolean {
  return readLocal(key) === '1';
}

function storedHiddenParts(): InventoryChromePart[] {
  return parseHiddenChromeParts(readLocal(STORAGE_KEYS.inventoryParts));
}
