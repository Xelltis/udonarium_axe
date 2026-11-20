import { inject, Injectable } from '@angular/core';
import { ChatLogClearReach, ChatLogClearService } from '@axe/application/chat/chat-log-clear.service';
import { VisibleChatTabsService } from '@axe/application/chat/visible-chat-tabs.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleManageTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { heldToGameMasterByServer } from '@axe/domain/peer/server-held';

/** One of the permissions a chat tab keeps for the players and the guests. */
export type ChatTabPermissionKey = 'plCanView' | 'plCanSpeak' | 'guestCanView' | 'guestCanSpeak';

/**
 * What this reader may do to the room's chat tabs, and doing it: the one place the tab settings and
 * the AI link both go through. A seat is offered, and manages, only the tabs it may read; the game
 * master every tab. A guest manages none.
 */
@Injectable({ providedIn: 'root' })
export class ChatTabEditService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly logClear = inject(ChatLogClearService);
  private readonly visible = inject(VisibleChatTabsService);

  /** The tabs this reader is offered, those it may read, in the order the room lists them. */
  readonly tabs = this.visible.tabs;

  /** Whether this reader may change the tabs at all, which every role but a guest may. */
  mayEditTabs(): boolean {
    this.objectChange.trackMyCursor();
    return canRoleEdit(PeerCursor.myRole);
  }

  /**
   * Whether a tab is among those this reader is offered, read afresh rather than as last followed,
   * though a computation reading it follows the list.
   */
  isOffered(tab: ChatTab): boolean {
    this.tabs();
    return this.visible.readableNow().includes(tab);
  }

  /** Whether this reader may manage a tab: rename, move, delete, save, clear, or change who reads it. */
  mayManage(tab: ChatTab): boolean {
    this.objectChange.trackMyCursor();
    this.objectChange.versionOf(tab.identifier)();
    return canRoleManageTab(tab, PeerCursor.myRole);
  }

  /** Whether this reader may rename or move a tab, which the system tab never is. */
  mayRearrange(tab: ChatTab): boolean {
    return !tab.isSystemTab && this.mayManage(tab);
  }

  /**
   * Whether a room server holds this reader to what only the game master may change in the tabs:
   * who may read a tab, and deleting the dice the server rolled. Among peers nothing is held back.
   */
  heldByServer(): boolean {
    this.objectChange.trackMyCursor();
    return heldToGameMasterByServer();
  }

  /**
   * Whether this reader may change one of a tab's permissions. In a room server's room, who may read
   * a tab is the game master's alone to change; anyone else may change who may speak only where those
   * who would speak may already read, since speaking brings reading with it.
   */
  mayChangePermission(tab: ChatTab, key: ChatTabPermissionKey): boolean {
    if (!this.mayRearrange(tab)) return false;
    if (!this.heldByServer()) return true;
    if (key === 'plCanSpeak') return tab.plCanView;
    if (key === 'guestCanSpeak') return tab.guestCanView;
    return false;
  }

  /**
   * Sets one of a tab's permissions: speaking brings reading with it, and reading taken away takes
   * speaking. Whether it was set; nothing changes where this reader may not change it.
   */
  setPermission(tab: ChatTab, key: ChatTabPermissionKey, value: boolean): boolean {
    if (!this.mayChangePermission(tab, key)) return false;
    tab[key] = value;
    if (key === 'plCanSpeak' && value) tab.plCanView = true;
    else if (key === 'plCanView' && !value) tab.plCanSpeak = false;
    else if (key === 'guestCanSpeak' && value) tab.guestCanView = true;
    else if (key === 'guestCanView' && !value) tab.guestCanSpeak = false;
    return true;
  }

  /** Renames a tab; whether it was renamed, which the system tab and a tab out of reach are not. */
  rename(tab: ChatTab, name: string): boolean {
    if (!this.mayRearrange(tab)) return false;
    tab.name = name;
    return true;
  }

  /** Adds a tab of the name at the end of the list; null for a seat that may not change the tabs. */
  create(name: string): ChatTab | null {
    if (!this.mayEditTabs()) return null;
    return ChatTabList.instance.addChatTab(name);
  }

  /**
   * Whether a tab is one that, in a room server's room, only the game master may delete, for holding
   * dice the server rolled, which the server keeps from anyone else's deleting.
   */
  deleteKeptForGameMaster(tab: ChatTab): boolean {
    if (!this.heldByServer()) return false;
    this.objectChange.collectionOf(ChatMessage.aliasName)();
    this.objectChange.versionOf(tab.identifier)();
    return tab.chatMessages.some((message) => message.isServerRoll);
  }

  /**
   * Whether this reader may delete a tab: one it manages, never the system tab, which would leave the
   * arrivals and departures nowhere to go but the conversation, and not one the server keeps for the
   * game master.
   */
  mayDelete(tab: ChatTab): boolean {
    return this.mayRearrange(tab) && !this.deleteKeptForGameMaster(tab);
  }

  /**
   * Takes a tab away for every peer, the place the system messages go to staying on the tab it was
   * on. Whether it was taken away.
   */
  delete(tab: ChatTab): boolean {
    if (!this.mayDelete(tab)) return false;
    this.keepingNoticeTab(() => tab.destroy());
    return true;
  }

  /**
   * Moves a tab one place up or down among the tabs this reader is offered, past those kept from it.
   * Whether it moved.
   */
  step(tab: ChatTab, direction: 1 | -1): boolean {
    const offered = this.visible.readableNow();
    const at = offered.indexOf(tab);
    return at >= 0 && this.moveTo(tab, at + direction + 1);
  }

  /**
   * Moves a tab to a place among the tabs this reader is offered, counted from 1, the place the
   * system messages go to staying on the tab it was on. Whether it moved.
   */
  moveTo(tab: ChatTab, place: number): boolean {
    if (!this.mayRearrange(tab)) return false;
    const offered = this.visible.readableNow();
    const from = offered.indexOf(tab);
    const to = Math.max(0, Math.min(offered.length - 1, Math.trunc(place) - 1));
    if (from < 0 || from === to) return false;
    const list = ChatTabList.instance;
    const target = offered[to];
    this.keepingNoticeTab(() => {
      if (to < from) list.insertBefore(tab, target);
      else {
        const after = list.chatTabs[list.chatTabs.indexOf(target) + 1];
        if (after) list.insertBefore(tab, after);
        else list.appendChild(tab);
      }
    });
    return true;
  }

  /**
   * Clears the logs of every tab this reader manages, all of each or as far as the reach given, posting
   * who cleared them in each. The tabs kept from this reader are left as they are.
   */
  clearAll(reach?: ChatLogClearReach): void {
    for (const tab of this.visible.readableNow()) if (this.mayManage(tab)) this.logClear.clear(tab, reach);
  }

  /** Makes a change to the list keeping the place the system messages go to on the same tab. */
  private keepingNoticeTab(change: () => void): void {
    const list = ChatTabList.instance;
    const noticed = list.chatTabs[list.systemMessageTabIndex];
    change();
    const at = noticed ? list.chatTabs.indexOf(noticed) : -1;
    const index = at >= 0 ? at : Math.max(0, Math.min(list.chatTabs.length - 1, list.systemMessageTabIndex));
    if (index !== list.systemMessageTabIndex) list.systemMessageTabIndex = index;
  }
}
