import { inject, Injectable, signal } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { type ResetRecord, type ResetUndoOutcome, undoReset } from '@axe/domain/character/piece-reset';

/** How taking a reset back ended, by the chat line that reported the reset. */
export interface ResetUndoResult extends ResetUndoOutcome {
  readonly messageIdentifier: string;
}

/**
 * Keeps what the latest reset on this device did, so the one who carried it out may take it back
 * once from the chat line that reported it.
 *
 * Only the latest reset is kept, in memory alone: the next reset takes its place, taking it back
 * uses it up, and a reload or leaving the room, which loads the page afresh, forgets it. Nothing is
 * synced or saved, so no other seat is offered the way back.
 */
@Injectable({ providedIn: 'root' })
export class ResetUndoService {
  private readonly rolePermission = inject(RolePermissionService);

  private readonly kept = signal<{ messageIdentifier: string; record: ResetRecord } | null>(null);
  private readonly ended = signal<ResetUndoResult | null>(null);

  /** Keeps what a reset did, in place of whatever was kept, under the chat line that reported it. */
  keep(messageIdentifier: string, record: ResetRecord): void {
    if (messageIdentifier.length < 1 || record.pieces.length < 1) return;
    this.kept.set({ messageIdentifier, record });
    this.ended.set(null);
  }

  /** Whether the reset a chat line reported can still be taken back from it, by a seat that may edit the table. */
  isOffered(messageIdentifier: string): boolean {
    return this.kept()?.messageIdentifier === messageIdentifier && this.rolePermission.canEditTabletop();
  }

  /** How taking back the reset a chat line reported ended, or null where it was not taken back from here. */
  resultOf(messageIdentifier: string): ResetUndoResult | null {
    const ended = this.ended();
    return ended?.messageIdentifier === messageIdentifier ? ended : null;
  }

  /**
   * Takes back the reset a chat line reported, and answers how that ended; null, changing nothing,
   * where that reset is not the one kept or the seat may not edit the table. The record is used up
   * whatever the outcome, so it cannot be taken back twice.
   */
  undo(messageIdentifier: string): ResetUndoResult | null {
    const kept = this.kept();
    if (!kept || kept.messageIdentifier !== messageIdentifier || !this.rolePermission.canEditTabletop()) return null;
    this.kept.set(null);
    const result = { messageIdentifier, ...undoReset(kept.record) };
    this.ended.set(result);
    return result;
  }

  /** Forgets the reset kept and how the last one taken back ended. */
  forget(): void {
    this.kept.set(null);
    this.ended.set(null);
  }
}
