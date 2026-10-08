import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';

/**
 * Whose a bookmark is: `shared` belongs to the room and everyone in it sees it, `personal` belongs
 * to one reader and is kept in their browser alone.
 */
export type ChatBookmarkKind = 'shared' | 'personal';

/** A reader's own bookmark on a line: the name they gave it, empty for the line's own words, and when it was put on. */
export interface PersonalChatBookmark {
  readonly title: string;
  readonly at: number;
}

/** A marked line, with the tab it is in, whose mark it is and the name it was given. */
export interface ChatBookmarkEntry {
  readonly message: ChatMessage;
  readonly tab: ChatTab;
  readonly kind: ChatBookmarkKind;
  /** The name the mark was given, empty where the line names it. */
  readonly name: string;
}

/** How many personal bookmarks a browser keeps; past it, the ones put on longest ago go first. */
export const MAX_PERSONAL_CHAT_BOOKMARKS = 1000;

/**
 * The marks this reader may see on the lines of the tabs given, in the order the lines were placed
 * in the log, the room's mark before the reader's own where a line has both.
 *
 * A mark goes with its line, so a line that has gone takes its marks with it, and a line kept from
 * the reader's chat, such as a whisper they were not part of or a deleted line, keeps its marks from
 * them too.
 */
export function collectChatBookmarks(
  tabs: readonly ChatTab[],
  personal: ReadonlyMap<string, PersonalChatBookmark> = new Map()
): ChatBookmarkEntry[] {
  const entries: ChatBookmarkEntry[] = [];
  for (const tab of tabs) {
    for (const message of tab.chatMessages) {
      if (!(message instanceof ChatMessage) || !message.isShownInChat) continue;
      if (message.isBookmarked) entries.push({ message, tab, kind: 'shared', name: message.bookmarkName });
      const own = personal.get(message.identifier);
      if (own) entries.push({ message, tab, kind: 'personal', name: own.title });
    }
  }
  return entries.sort((a, b) => a.message.placedAt - b.message.placedAt);
}

/**
 * Reads a browser's personal bookmarks back from what `serializePersonalChatBookmarks` wrote.
 *
 * Anything that cannot be read, a whole list or a single entry, is passed over rather than
 * stopping the rest.
 */
export function parsePersonalChatBookmarks(raw: string | null): Map<string, PersonalChatBookmark> {
  const marks = new Map<string, PersonalChatBookmark>();
  if (!raw) return marks;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return marks;
  }
  if (!Array.isArray(list)) return marks;
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, title, at } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id.length === 0) continue;
    const time = Number(at);
    marks.set(id, {
      title: typeof title === 'string' ? title.trim() : '',
      at: Number.isFinite(time) ? time : 0,
    });
  }
  return marks;
}

/** Writes a browser's personal bookmarks out to keep, the newest `max` of them, newest first. */
export function serializePersonalChatBookmarks(
  marks: ReadonlyMap<string, PersonalChatBookmark>,
  max = MAX_PERSONAL_CHAT_BOOKMARKS
): string {
  const list = [...marks.entries()]
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, max)
    .map(([id, mark]) => (mark.title ? { id, title: mark.title, at: mark.at } : { id, at: mark.at }));
  return JSON.stringify(list);
}
