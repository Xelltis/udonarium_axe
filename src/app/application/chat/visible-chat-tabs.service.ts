import { computed, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** The chat tabs this reader's role may read, the one list every view of the chat offers its tabs from. */
@Injectable({ providedIn: 'root' })
export class VisibleChatTabsService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);

  /**
   * The tabs this reader's role may read, in the order the room lists them.
   *
   * It follows the tabs coming and going, the order they are listed in, each tab's own settings and
   * the reader's role, any of which can take a tab away. A new list is given whenever any of those
   * changes, whether or not the tabs in it are the same, so what is drawn from a tab is drawn again.
   */
  readonly tabs = computed<ChatTab[]>(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.versionOf(ChatTabList.instance.identifier)();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return this.chatMessageService.chatTabs.filter((tab) => {
      this.objectChange.versionOf(tab.identifier)();
      return canRoleViewTab(tab, role);
    });
  });
}
