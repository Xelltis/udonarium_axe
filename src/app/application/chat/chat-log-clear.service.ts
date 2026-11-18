import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/network/network';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';

/**
 * How much of a tab's log is cleared: all of it where nothing is given, the lines said before a
 * moment in epoch milliseconds, or the lines standing before one line of the tab.
 */
export type ChatLogClearReach = { readonly before: number } | { readonly beforeLine: ChatMessage };

/** The moment as the notice of a clearing names it, in the local time of the seat that asked. */
export function clearedMomentText(moment: number): string {
  const at = new Date(moment);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}/${two(at.getMonth() + 1)}/${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/**
 * Clears the log of a chat tab for every peer, all of it or what is older than a moment or a line,
 * and posts who cleared it. Cleared lines are gone from the room for good.
 */
@Injectable({ providedIn: 'root' })
export class ChatLogClearService {
  private readonly chat = inject(ChatMessageService);
  private readonly objectChange = inject(ObjectChangeService);

  /**
   * Whether logs are this reader's to clear. A log belongs to the room rather than to a seat, and a
   * seat that is only watching clears none.
   */
  get canClear(): boolean {
    this.objectChange.trackMyCursor();
    return canRoleEdit(PeerCursor.myRole);
  }

  /**
   * Whether a room server keeps the dice it rolled from this seat's clearing, which it does from
   * anyone but the game master. Among peers nothing is kept.
   */
  get keepsServerRolls(): boolean {
    this.objectChange.trackMyCursor();
    return Network.authorityPeerId !== null && !PeerCursor.isMyselfGameMaster;
  }

  /** The lines of the tab a clearing of that reach takes, in the order they stand. */
  linesWithin(tab: ChatTab, reach?: ChatLogClearReach): ChatMessage[] {
    const lines = tab.chatMessages.filter((line) => line instanceof ChatMessage);
    const reached = !reach
      ? lines
      : 'before' in reach
        ? lines.filter((line) => line.timestamp < reach.before)
        : lines.slice(0, Math.max(lines.indexOf(reach.beforeLine), 0));
    return this.keepsServerRolls ? reached.filter((line) => !line.isServerRoll) : reached;
  }

  /**
   * Clears the tab's log as far as the reach given, the whole of it where none is, and posts in the
   * tab who cleared it and up to when. Clearing the whole log puts the tab's portraits back as well.
   * Does nothing for a seat that may not clear logs.
   */
  clear(tab: ChatTab, reach?: ChatLogClearReach): void {
    if (!this.canClear) return;
    const moment = !reach ? null : 'before' in reach ? reach.before : reach.beforeLine.timestamp;
    for (const line of this.linesWithin(tab, reach)) line.destroy();
    if (!reach) tab.portraitReset();

    const cursor = PeerCursor.myCursor;
    const user = cursor?.name?.trim() || cursor?.identifier || '';
    const notice =
      moment === null
        ? encodeI18nMessage('common.chat.logClearedBy', { user })
        : encodeI18nMessage('common.chat.logClearedBeforeBy', { user, time: clearedMomentText(moment) });
    this.chat.sendSystemMessageToTab(tab, notice, undefined, cursor?.userId ?? '');
  }
}
