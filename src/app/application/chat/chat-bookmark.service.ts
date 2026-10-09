import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ChatPersonalBookmarkStore } from '@axe/application/chat/chat-personal-bookmark.store';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatBookmarkEntry, ChatBookmarkKind, collectChatBookmarks } from '@axe/domain/chat/chat-bookmark';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
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
  private readonly objectStore = inject(ObjectStore);
  private readonly personal = inject(ChatPersonalBookmarkStore);

  /**
   * The lines that carry the room's mark, by identifier.
   *
   * Kept up as lines come, change and go rather than found by reading the whole log, since the
   * count is on show in every chat window and a busy room changes a line many times a minute.
   */
  private readonly shared = signal<ReadonlySet<string>>(new Set());
  /** Moves on whenever a marked line, or a tab, changes in a way the list may show. */
  private readonly revision = signal(0);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const marked = this.objectStore.getObjects(ChatMessage).filter((line) => line.isBookmarked);
    this.shared.set(new Set(marked.map((line) => line.identifier)));
    this.objectChange.objectAdded$.subscribe((event) => {
      if (event.aliasName === ChatMessage.aliasName) this.notice(event.identifier);
    }, destroyRef);
    this.objectChange.objectRemoved$.subscribe((event) => {
      if (event.aliasName === ChatMessage.aliasName) this.notice(event.identifier);
    }, destroyRef);
    this.objectChange.objectChanged$.subscribe((event) => {
      if (event.aliasName === ChatMessage.aliasName) this.notice(event.identifier);
      else if (event.aliasName === ChatTab.aliasName) this.revision.update((v) => v + 1);
    }, destroyRef);
  }

  /**
   * The marks this reader may see, both kinds, across the tabs they may read, in the order their
   * lines were said.
   */
  readonly entries = computed<readonly ChatBookmarkEntry[]>(() => {
    this.revision();
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.trackMyCursor();
    const personal = this.personal.all();
    const role = PeerCursor.myRole;
    const lines = new Set<ChatMessage>();
    for (const identifier of [...this.shared(), ...personal.keys()]) {
      const line = this.objectStore.get(identifier);
      if (line instanceof ChatMessage) lines.add(line);
    }
    return collectChatBookmarks(lines, personal, (tab) => canRoleViewTab(tab, role));
  });

  /**
   * Takes in what became of a line: whether it now carries the room's mark, and, where it carries a
   * mark of either kind or did, that the list may read differently.
   */
  private notice(identifier: string): void {
    const line = this.objectStore.get(identifier);
    const marked = line instanceof ChatMessage && line.isBookmarked;
    const was = this.shared().has(identifier);
    if (marked !== was) {
      const next = new Set(this.shared());
      if (marked) next.add(identifier);
      else next.delete(identifier);
      this.shared.set(next);
    }
    if (marked || was || this.personal.has(identifier)) this.revision.update((v) => v + 1);
  }

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
    this.notice(message.identifier);
  }

  /** Takes the mark of the kind off the line. */
  remove(message: ChatMessage, kind: ChatBookmarkKind): void {
    if (!this.canEdit(kind)) return;
    if (kind === 'shared') message.unbookmark();
    else this.personal.remove(message.identifier);
    this.notice(message.identifier);
  }

  /** Names the mark of the kind on the line; an empty name goes back to naming it after the line. */
  rename(message: ChatMessage, kind: ChatBookmarkKind, title: string): void {
    if (!this.canEdit(kind) || !this.isBookmarked(message, kind)) return;
    if (kind === 'shared') message.renameBookmark(title);
    else this.personal.rename(message.identifier, title);
    this.notice(message.identifier);
  }
}
