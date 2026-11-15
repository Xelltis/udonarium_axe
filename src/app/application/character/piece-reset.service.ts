import { inject, Injectable } from '@angular/core';
import { ResetUndoService } from '@axe/application/character/reset-undo.service';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { emitResetCarriedOut } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  countReset,
  resetAcross,
  type ResetCount,
  ResetRecorder,
  type ResetRequest,
  type ResetUndoOutcome,
} from '@axe/domain/character/piece-reset';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';

/**
 * Resets pieces from a button: clears them of buffs, puts their values back to their defaults, or
 * both, and says so in chat on a line the reset can be taken back from.
 *
 * The work is the same the chat commands do, and what it did reaches {@link ResetUndoService} the
 * same way, as an event of this device naming the line that reports it. A seat that may not edit
 * the table resets nothing.
 */
@Injectable({ providedIn: 'root' })
export class PieceResetService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly chat = inject(ChatMessageService);
  private readonly resetUndo = inject(ResetUndoService);
  private readonly objectStore = inject(ObjectStore);
  private readonly statusAilments = inject(StatusAilmentService);

  /** A piece with the parts that go with it, which a reset of the piece takes along. */
  withParts(piece: GameCharacter): GameCharacter[] {
    return [piece, ...piece.partsAlong()];
  }

  /**
   * What a reset would reach on these pieces, changing nothing; see {@link countReset}. A debuff is
   * told from a buff by the states the room keeps, read as a signal so a count worked out in a
   * computed follows the room's list.
   */
  count(pieces: readonly GameCharacter[], request: ResetRequest): ResetCount {
    return countReset(pieces, request, this.statusAilments.ailments());
  }

  /**
   * Resets these pieces, each on its own, and reports it with the line `report` makes of what was
   * reached, where it makes one; the reset can then be taken back from that line. The line goes
   * where the room sends notices of rounds; in a room that sends those nowhere it is written for
   * this seat alone, so whoever reset still reads what went and may take it back, and nobody else is
   * told against the room's choice. Nothing is done, and null comes back, for a seat that may not
   * edit the table.
   */
  run(
    pieces: readonly GameCharacter[],
    request: ResetRequest,
    report: (count: ResetCount) => string | null
  ): ResetCount | null {
    if (!this.rolePermission.canEditTabletop()) return null;
    const recorder = new ResetRecorder();
    recorder.watch(pieces);
    const count = resetAcross(pieces, request, this.statusAilments.ailments());
    const text = report(count);
    const posted = text ? this.reportTo(text) : null;
    const record = recorder.finish();
    if (posted && record.pieces.length > 0) emitResetCarriedOut({ messageIdentifier: posted.identifier, record });
    return count;
  }

  private reportTo(text: string): ChatMessage | null {
    return this.chat.sendSystemNotice('round', text) ?? this.chat.tellSelfSystemNotice('round', text);
  }

  /**
   * Takes back the reset a chat line reported, and tells the room on the same tab where any piece
   * was put back; where the line was written for this seat alone, so is that. Null where there was
   * nothing of that line's to take back.
   */
  takeBack(message: ChatMessage): ResetUndoOutcome | null {
    const result = this.resetUndo.undo(message.identifier);
    if (!result) return null;
    const tab = this.objectStore.get<ChatTab>(message.tabIdentifier);
    if (result.restored > 0 && tab instanceof ChatTab) {
      const text = encodeI18nMessage('feature.chat.reset.undoneNotice', { restored: result.restored });
      if (message.isSystemToPL) this.chat.tellSelfInTab(tab, text);
      else this.chat.sendSystemMessageToTab(tab, text);
    }
    return result;
  }
}
