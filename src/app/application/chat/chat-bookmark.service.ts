import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ChatBookmarkEntry, collectChatBookmarks } from '@axe/domain/chat/chat-bookmark';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * The room's marks on chat lines, which everybody in the room shares.
 *
 * A mark is kept on the line it marks, so it travels with the line, is saved with the room, and
 * goes when the line goes. Anyone at the table may put marks on, name them, and take them off; a
 * guest, there to watch, may only follow them.
 */
@Injectable({ providedIn: 'root' })
export class ChatBookmarkService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatTabList = inject(ChatTabList);

  /** The marked lines this reader may see, across the tabs they may read, in the order they were said. */
  readonly entries = computed<readonly ChatBookmarkEntry[]>(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.collectionOf(ChatMessage.aliasName)();
    this.objectChange.versionOf(this.chatTabList.identifier)();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return collectChatBookmarks(this.chatTabList.chatTabs.filter((tab) => canRoleViewTab(tab, role)));
  });

  /** Whether this reader may put marks on, name them and take them off. */
  get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  /**
   * Whether this reader may mark the line: it is a line in one of the room's tabs that they are
   * shown, and not a notice meant for them alone.
   */
  canBookmark(message: ChatMessage): boolean {
    if (!this.canEdit) return false;
    if (!(message.parent instanceof ChatTab)) return false;
    return message.isShownInChat && !message.isSystemToPL;
  }

  /** Marks the line, or takes the mark off a line already marked. */
  toggle(message: ChatMessage): void {
    if (message.isBookmarked) this.remove(message);
    else this.add(message);
  }

  /** Marks the line for the room to find again. */
  add(message: ChatMessage): void {
    if (!this.canBookmark(message)) return;
    message.bookmark(Date.now());
  }

  /** Takes the mark off the line. */
  remove(message: ChatMessage): void {
    if (!this.canEdit) return;
    message.unbookmark();
  }

  /** Names the mark on the line; an empty name goes back to naming it after the line. */
  rename(message: ChatMessage, title: string): void {
    if (!this.canEdit || !message.isBookmarked) return;
    message.renameBookmark(title);
  }
}
