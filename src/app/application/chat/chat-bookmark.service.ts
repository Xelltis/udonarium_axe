import { computed, inject, Injectable } from '@angular/core';
import { ChatPersonalBookmarkStore } from '@axe/application/chat/chat-personal-bookmark.store';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ChatBookmarkEntry, ChatBookmarkKind, collectChatBookmarks } from '@axe/domain/chat/chat-bookmark';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * Bookmarks on chat lines, of two kinds.
 *
 * A shared bookmark belongs to the room: it is kept on the line it marks, so it travels with the
 * line, is saved with the room and goes when the line goes. Anyone at the table may put them on,
 * name them and take them off; a guest, there to watch, may only follow them. A personal bookmark
 * belongs to this reader alone and is kept in this browser, so a guest may keep those too.
 */
@Injectable({ providedIn: 'root' })
export class ChatBookmarkService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatTabList = inject(ChatTabList);
  private readonly personal = inject(ChatPersonalBookmarkStore);

  /**
   * The marks this reader may see, both kinds, across the tabs they may read, in the order their
   * lines were said.
   */
  readonly entries = computed<readonly ChatBookmarkEntry[]>(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.collectionOf(ChatMessage.aliasName)();
    this.objectChange.versionOf(this.chatTabList.identifier)();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    const tabs = this.chatTabList.chatTabs.filter((tab) => canRoleViewTab(tab, role));
    return collectChatBookmarks(tabs, this.personal.all());
  });

  /** Whether this reader may put on, name and take off marks of the kind: anyone their own, the table the room's. */
  canEdit(kind: ChatBookmarkKind): boolean {
    return kind === 'personal' || this.rolePermission.canEditTabletop;
  }

  /**
   * Whether this reader may mark the line with the kind: they may change marks of that kind, and it is
   * a line in one of the room's tabs that they are shown, not a notice meant for them alone.
   */
  canBookmark(message: ChatMessage, kind: ChatBookmarkKind): boolean {
    if (!this.canEdit(kind)) return false;
    if (!(message.parent instanceof ChatTab)) return false;
    return message.isShownInChat && !message.isSystemToPL;
  }

  /** Whether the line carries a mark of the kind. Read through `entries` or the line's version to follow it. */
  isBookmarked(message: ChatMessage, kind: ChatBookmarkKind): boolean {
    return kind === 'shared' ? message.isBookmarked : this.personal.has(message.identifier);
  }

  /** The name the mark of the kind on the line was given, empty where the line names it. */
  nameOf(message: ChatMessage, kind: ChatBookmarkKind): string {
    if (kind === 'shared') return message.bookmarkName;
    return this.personal.all().get(message.identifier)?.title ?? '';
  }

  /** Marks the line with the kind, or takes that mark off a line already marked. */
  toggle(message: ChatMessage, kind: ChatBookmarkKind): void {
    if (this.isBookmarked(message, kind)) this.remove(message, kind);
    else this.add(message, kind);
  }

  /** Marks the line to find again, for the room or for this reader. */
  add(message: ChatMessage, kind: ChatBookmarkKind): void {
    if (!this.canBookmark(message, kind)) return;
    if (kind === 'shared') message.bookmark(Date.now());
    else this.personal.add(message.identifier, Date.now());
  }

  /** Takes the mark of the kind off the line. */
  remove(message: ChatMessage, kind: ChatBookmarkKind): void {
    if (!this.canEdit(kind)) return;
    if (kind === 'shared') message.unbookmark();
    else this.personal.remove(message.identifier);
  }

  /** Names the mark of the kind on the line; an empty name goes back to naming it after the line. */
  rename(message: ChatMessage, kind: ChatBookmarkKind, title: string): void {
    if (!this.canEdit(kind) || !this.isBookmarked(message, kind)) return;
    if (kind === 'shared') message.renameBookmark(title);
    else this.personal.rename(message.identifier, title);
  }
}
