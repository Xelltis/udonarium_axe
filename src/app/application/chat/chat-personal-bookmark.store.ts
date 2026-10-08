import { Injectable, signal } from '@angular/core';
import {
  parsePersonalChatBookmarks,
  PersonalChatBookmark,
  serializePersonalChatBookmarks,
} from '@axe/domain/chat/chat-bookmark';

export const CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY = 'chat-personal-bookmarks';

/**
 * This reader's own bookmarks on chat lines, kept in this browser by the identifier of the line.
 *
 * Nothing here reaches the room or its saved data. A line keeps its identifier through a save and a
 * load, so a room read back in this browser finds its marks again; a mark whose line is not in the
 * room is simply not shown. Only the newest are kept, so marks left on rooms long gone fall away.
 */
@Injectable({ providedIn: 'root' })
export class ChatPersonalBookmarkStore {
  private readonly marks = signal<ReadonlyMap<string, PersonalChatBookmark>>(stored());

  /** Every mark this browser keeps, by the identifier of the line it is on. */
  readonly all = this.marks.asReadonly();

  /** Whether the line is marked in this browser. */
  has(identifier: string): boolean {
    return this.marks().has(identifier);
  }

  /** Marks the line. A line marked already keeps its mark as it was. */
  add(identifier: string, at: number): void {
    if (this.has(identifier)) return;
    this.write(new Map(this.marks()).set(identifier, { title: '', at }));
  }

  /** Takes the mark off the line. */
  remove(identifier: string): void {
    if (!this.has(identifier)) return;
    const next = new Map(this.marks());
    next.delete(identifier);
    this.write(next);
  }

  /** Names the mark on the line; an empty name goes back to naming it after the line. */
  rename(identifier: string, title: string): void {
    const mark = this.marks().get(identifier);
    if (!mark) return;
    const next = title.trim();
    if (next === mark.title) return;
    this.write(new Map(this.marks()).set(identifier, { ...mark, title: next }));
  }

  private write(next: ReadonlyMap<string, PersonalChatBookmark>): void {
    this.marks.set(next);
    try {
      localStorage.setItem(CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY, serializePersonalChatBookmarks(next));
    } catch {
      // Private browsing refuses the write; the marks still hold for this session.
    }
  }
}

function stored(): Map<string, PersonalChatBookmark> {
  try {
    return parsePersonalChatBookmarks(localStorage.getItem(CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY));
  } catch {
    return new Map();
  }
}
