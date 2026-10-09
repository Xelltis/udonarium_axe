import { DestroyRef, inject, Injectable, signal } from '@angular/core';
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
 *
 * Every window of the app in this browser shares the one store: a change is made to what the
 * browser holds at that moment, not to what this window read earlier, and a change another window
 * makes is taken up here as soon as the browser reports it.
 */
@Injectable({ providedIn: 'root' })
export class ChatPersonalBookmarkStore {
  private readonly marks = signal<ReadonlyMap<string, PersonalChatBookmark>>(stored() ?? new Map());

  /** Every mark this browser keeps, by the identifier of the line it is on. */
  readonly all = this.marks.asReadonly();

  constructor() {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY) return;
      this.marks.set(stored() ?? new Map());
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /** Whether the line is marked in this browser. */
  has(identifier: string): boolean {
    return this.marks().has(identifier);
  }

  /** Marks the line. A line marked already keeps its mark as it was. */
  add(identifier: string, at: number): void {
    this.update((marks) => {
      if (marks.has(identifier)) return false;
      marks.set(identifier, { title: '', at });
      return true;
    });
  }

  /** Takes the mark off the line. */
  remove(identifier: string): void {
    this.update((marks) => marks.delete(identifier));
  }

  /** Names the mark on the line; an empty name goes back to naming it after the line. */
  rename(identifier: string, title: string): void {
    this.update((marks) => {
      const mark = marks.get(identifier);
      const next = title.trim();
      if (!mark || next === mark.title) return false;
      marks.set(identifier, { ...mark, title: next });
      return true;
    });
  }

  /** Whether the browser refused the last write, so that what it holds is behind this window. */
  private writeRefused = false;

  /**
   * Makes one change to the marks the browser holds now, and keeps the result. `change` answers
   * whether it changed anything; nothing is written where it did not. While the browser refuses to
   * keep them, as private browsing may, the change is made to this window's own instead.
   */
  private update(change: (marks: Map<string, PersonalChatBookmark>) => boolean): void {
    const next = new Map((this.writeRefused ? null : stored()) ?? this.marks());
    const changed = change(next);
    this.marks.set(next);
    if (!changed) return;
    try {
      localStorage.setItem(CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY, serializePersonalChatBookmarks(next));
      this.writeRefused = false;
    } catch {
      this.writeRefused = true;
    }
  }
}

/** The marks the browser holds now, or null where it refuses to be read. */
function stored(): Map<string, PersonalChatBookmark> | null {
  try {
    return parsePersonalChatBookmarks(localStorage.getItem(CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY));
  } catch {
    return null;
  }
}
