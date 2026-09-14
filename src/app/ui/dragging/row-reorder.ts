import { signal } from '@angular/core';

export type DropSide = 'before' | 'after';

/**
 * Dragging a row up and down a list.
 *
 * Every list that reorders this way needs the same three answers — what is held, what
 * it is over, and which half of that row the pointer is on — and needs all three cleared
 * together on the release. Only what happens at the end differs, so that is left outside.
 */
export class RowReorder<T> {
  private readonly heldRow = signal<T | null>(null);
  private readonly overRow = signal<T | null>(null);
  private readonly side = signal<DropSide | null>(null);

  /** The row being dragged, or null between drags. */
  readonly held = this.heldRow.asReadonly();
  /** The row it is over. Null once it leaves the list, or while it is over itself. */
  readonly over = this.overRow.asReadonly();

  /** Starts dragging a row; until this is called, hovering marks nothing. */
  begin(row: T): void {
    this.heldRow.set(row);
  }

  /** The row the pointer is over, without taking a side. */
  hover(row: T): void {
    if (this.heldRow() === null) return;
    if (this.overRow() !== row) this.overRow.set(row);
    this.side.set(null);
  }

  /** The same, taking the side from which half of the row the pointer is on. */
  hoverHalf(row: T, bounds: { top: number; height: number }, y: number): void {
    if (this.heldRow() === null) return;
    if (row === this.heldRow()) {
      this.leave();
      return;
    }
    this.overRow.set(row);
    this.side.set(y > bounds.top + bounds.height / 2 ? 'after' : 'before');
  }

  /** The pointer has left the rows without leaving the drag. */
  leave(): void {
    this.overRow.set(null);
    this.side.set(null);
  }

  /**
   * The drop, and the end of the drag.
   *
   * Null when it lands nowhere or back on itself, which the caller reads as nothing to do.
   */
  release(): { held: T; over: T; side: DropSide | null } | null {
    const held = this.heldRow();
    const over = this.overRow();
    const side = this.side();
    this.cancel();
    if (held === null || over === null || held === over) return null;
    return { held, over, side };
  }

  /** Ends the drag without a drop, clearing what was held, what it was over and the side. */
  cancel(): void {
    this.heldRow.set(null);
    this.overRow.set(null);
    this.side.set(null);
  }

  /** Whether this row is the one being dragged, for dimming it while it is carried. */
  isHeld(row: T): boolean {
    return this.heldRow() === row;
  }

  /** Whether a drop now would land above this row, so the marker is drawn at its top edge. */
  isDropBefore(row: T): boolean {
    return this.isDropOn(row, 'before');
  }

  /** Whether a drop now would land below this row, so the marker is drawn at its bottom edge. */
  isDropAfter(row: T): boolean {
    return this.isDropOn(row, 'after');
  }

  private isDropOn(row: T, side: DropSide): boolean {
    return this.overRow() === row && this.side() === side && !this.isHeld(row);
  }
}

/**
 * Where a row lands once it is lifted out of the list and put back.
 *
 * Taking it out first is what makes the answer differ from the index of the row it lands
 * beside: everything below has already moved up one. With no side it takes the place of
 * the row it was dropped on, which puts it after that row coming down the list and before
 * it going up. Null when either row is not in the list, or when it lands where it was.
 */
export function landingIndex<T>(order: readonly T[], held: T, over: T, side: DropSide | null): number | null {
  const from = order.indexOf(held);
  const at = order.indexOf(over);
  if (from < 0 || at < 0) return null;
  if (side === null) return at === from ? null : at;

  const beside = side === 'after' ? at + 1 : at;
  const to = beside > from ? beside - 1 : beside;
  return to === from ? null : to;
}

/** The list with the row moved, or null when the move changes nothing. */
export function reorderRows<T>(order: readonly T[], held: T, over: T, side: DropSide | null): T[] | null {
  const to = landingIndex(order, held, over, side);
  if (to === null) return null;

  const moved = [...order];
  moved.splice(moved.indexOf(held), 1);
  moved.splice(to, 0, held);
  return moved;
}
