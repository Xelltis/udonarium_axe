import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { formatLogMoment } from '@axe/domain/chat/chat-log-rich';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { heldToGameMasterByServer } from '@axe/domain/peer/server-held';

/**
 * How much of a tab's log is cleared: all of it where nothing is given, the lines that stand in the
 * log before a moment in epoch milliseconds, or the lines standing before one line of the tab. A line
 * stands in the log where it was shown to the table, which for a line kept back and disclosed later
 * is when it was disclosed, not when it was said.
 */
export type ChatLogClearReach = { readonly before: number } | { readonly beforeLine: ChatMessage };

/**
 * The moment as the notice of a clearing names it: in the local time of the seat that asked, with how
 * far that time stands from UTC, since the notice is read as it is by seats that may keep another.
 */
export function clearedMomentText(moment: number): string {
  const ahead = -new Date(moment).getTimezoneOffset();
  const hours = Math.floor(Math.abs(ahead) / 60);
  const minutes = Math.abs(ahead) % 60;
  const zone = `UTC${ahead < 0 ? '-' : '+'}${hours}${minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : ''}`;
  return `${formatLogMoment(moment)} (${zone})`;
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
    return heldToGameMasterByServer();
  }

  /**
   * The lines of the tab a clearing of that reach takes, in the order they stand: of the lines this
   * seat may see alone, whatever the reach and whoever clears. A whisper between others is none of
   * this seat's to clear, and counting it would tell how many there are; it is left where it stands.
   */
  linesWithin(tab: ChatTab, reach?: ChatLogClearReach): ChatMessage[] {
    const lines = tab.chatMessages.filter((line) => line instanceof ChatMessage && line.isDisplayable);
    const reached = !reach
      ? lines
      : 'before' in reach
        ? lines.filter((line) => line.placedAt < reach.before)
        : lines.slice(0, Math.max(lines.indexOf(reach.beforeLine), 0));
    return this.keepsServerRolls ? reached.filter((line) => !line.isServerRoll) : reached;
  }

  /**
   * Clears the tab's log as far as the reach given, the whole of it where none is, of the lines this
   * seat may see, and posts in the tab who cleared it and up to when. Clearing the whole log puts the tab's portraits back as well.
   * A reach that takes no line of the tab leaves it as it is, with nothing posted. Does nothing for a
   * seat that may not clear logs.
   */
  clear(tab: ChatTab, reach?: ChatLogClearReach): void {
    if (!this.canClear) return;
    const moment = !reach ? null : 'before' in reach ? reach.before : reach.beforeLine.placedAt;
    const lines = this.linesWithin(tab, reach);
    if (reach && lines.length === 0) return;
    for (const line of lines) line.destroy();
    if (!reach) {
      // The whole log takes whatever else the tab holds with it, as a tab read from another version may.
      for (const child of [...tab.children]) if (!(child instanceof ChatMessage)) child.destroy();
      tab.portraitReset();
    }

    const cursor = PeerCursor.myCursor;
    const user = cursor?.name?.trim() || cursor?.identifier || '';
    const notice =
      moment === null
        ? encodeI18nMessage('common.chat.logClearedBy', { user })
        : encodeI18nMessage('common.chat.logClearedBeforeBy', { user, time: clearedMomentText(moment) });
    this.chat.sendSystemMessageToTab(tab, notice, undefined, cursor?.userId ?? '');
  }
}
