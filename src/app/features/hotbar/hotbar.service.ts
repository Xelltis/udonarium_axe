import { Injectable, signal } from '@angular/core';
import { HotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HotbarCell } from '@axe/domain/hotbar/hotbar-size';

export interface RemovedHotbarSlot {
  cell: HotbarCell;
  draft: HotbarSlotDraft;
}

/** What the bar is carrying about this session: a slot on its way somewhere, and the last one cleared. */
@Injectable({ providedIn: 'root' })
export class HotbarService {
  private readonly held = signal<HotbarSlotDraft | null>(null);
  private readonly removed = signal<RemovedHotbarSlot | null>(null);

  readonly clipboard = this.held.asReadonly();
  readonly lastRemoved = this.removed.asReadonly();

  /** Holds a copy of a slot to paste into another, for the rest of this session. */
  copy(draft: HotbarSlotDraft): void {
    this.held.set({ ...draft });
  }

  /**
   * Remembers the slot just cleared and where it was, so clearing it can be undone. Only the last
   * one is kept.
   */
  rememberRemoved(cell: HotbarCell, draft: HotbarSlotDraft): void {
    this.removed.set({ cell: { ...cell }, draft: { ...draft } });
  }

  /**
   * Hands back the last cleared slot to put back, and forgets it; null when there is nothing to
   * undo.
   */
  takeRemoved(): RemovedHotbarSlot | null {
    const held = this.removed();
    this.removed.set(null);
    return held;
  }
}
