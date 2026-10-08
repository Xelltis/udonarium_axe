import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';

/** A line marked for the room to find again, with the tab it is in. */
export interface ChatBookmarkEntry {
  readonly message: ChatMessage;
  readonly tab: ChatTab;
}

/**
 * The marked lines of the tabs that this reader may see, in the order they were placed in the log.
 *
 * A mark lives on its line, so a line that has gone takes its mark with it, and a line kept from
 * the reader's chat, such as a whisper they were not part of or a deleted line, keeps its mark from
 * them too.
 */
export function collectChatBookmarks(tabs: readonly ChatTab[]): ChatBookmarkEntry[] {
  const entries: ChatBookmarkEntry[] = [];
  for (const tab of tabs) {
    for (const message of tab.chatMessages) {
      if (message instanceof ChatMessage && message.isBookmarked && message.isShownInChat) {
        entries.push({ message, tab });
      }
    }
  }
  return entries.sort((a, b) => a.message.placedAt - b.message.placedAt);
}
