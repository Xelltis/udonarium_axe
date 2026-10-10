import { computed, Injectable, signal } from '@angular/core';

export interface TabletopObjectSelection {
  identifier: string;
  className: string;
}

export interface TabletopObjectHighlight {
  identifier: string;
  timestamp: number;
}

export interface TabletopCoordinate {
  x: number;
  y: number;
  timestamp: number;
}

export interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

@Injectable({
  providedIn: 'root',
})
export class SelectionSignalService {
  readonly selectedObject = signal<TabletopObjectSelection | null>(null);
  readonly highlightedObject = signal<TabletopObjectHighlight | null>(null);
  readonly focusCoordinate = signal<TabletopCoordinate | null>(null);
  readonly cancelTableGestureVersion = signal(0);

  private readonly _selectedObjects = signal<ReadonlySet<string>>(new Set());
  readonly selectedObjects = this._selectedObjects.asReadonly();
  readonly selectionSize = computed(() => this._selectedObjects().size);

  readonly marqueeState = signal<MarqueeRect | null>(null);

  /**
   * Records a piece as the one last selected, which inventories, effect targeting and move ranges
   * follow. The multi-selection is left alone.
   */
  selectObject(identifier: string, className: string): void {
    this.selectedObject.set({ identifier, className });
  }

  /** Asks the piece with this identifier to flash on the table, so the reader can find it. */
  highlightObject(identifier: string): void {
    this.highlightedObject.set({ identifier, timestamp: Date.now() });
  }

  /** Asks the game table to glide its view over to a point on the table. */
  focusToCoordinate(x: number, y: number): void {
    this.focusCoordinate.set({ x, y, timestamp: Date.now() });
  }

  /** Asks the game table to drop whatever pointer gesture it is in the middle of. */
  cancelTableGesture(): void {
    this.cancelTableGestureVersion.update((v) => v + 1);
  }

  /** Whether a piece is part of the multi-selection. */
  isSelected(identifier: string): boolean {
    return this._selectedObjects().has(identifier);
  }

  /**
   * Adds a piece to the multi-selection. Given a class name, it also becomes the piece last
   * selected. A piece already in is left as it is.
   */
  addSelection(identifier: string, className?: string): void {
    const current = this._selectedObjects();
    if (current.has(identifier)) return;
    const next = new Set(current);
    next.add(identifier);
    this._selectedObjects.set(next);
    if (className) this.selectObject(identifier, className);
  }

  /** Takes a piece out of the multi-selection, if it is in it. */
  removeSelection(identifier: string): void {
    const current = this._selectedObjects();
    if (!current.has(identifier)) return;
    const next = new Set(current);
    next.delete(identifier);
    this._selectedObjects.set(next);
  }

  /**
   * Adds a piece to the multi-selection or takes it out. Given a class name, a piece added also
   * becomes the piece last selected.
   */
  toggleSelection(identifier: string, className?: string): void {
    const current = this._selectedObjects();
    const next = new Set(current);
    if (next.has(identifier)) {
      next.delete(identifier);
    } else {
      next.add(identifier);
      if (className) this.selectObject(identifier, className);
    }
    this._selectedObjects.set(next);
  }

  /**
   * Replaces the multi-selection with these pieces, optionally recording which of them was touched
   * last.
   */
  replaceSelection(ids: Iterable<string>, lastTouched?: TabletopObjectSelection): void {
    this._selectedObjects.set(new Set(ids));
    if (lastTouched) this.selectObject(lastTouched.identifier, lastTouched.className);
  }

  /**
   * What a left press on a piece does to the multi-selection.
   *
   * With Ctrl or ⌘ held it adds the piece or takes it out. Without, a press on a piece outside a
   * selection narrows the selection to that piece; with nothing selected, or on a piece already
   * in the selection, it leaves the selection, and whatever the press goes on to do, alone.
   *
   * @returns whether the press was spent on the selection, and so should go no further.
   */
  press(identifier: string, className: string, toggling: boolean): boolean {
    if (toggling) {
      this.toggleSelection(identifier, className);
      return true;
    }
    const selected = this._selectedObjects();
    if (selected.size === 0 || selected.has(identifier)) return false;
    this.replaceSelection([identifier], { identifier, className });
    return false;
  }

  /** Empties the multi-selection. The piece last selected is left as it was. */
  clearSelection(): void {
    if (this._selectedObjects().size === 0) return;
    this._selectedObjects.set(new Set());
  }
}
