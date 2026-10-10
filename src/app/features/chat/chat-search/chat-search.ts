import { TranslateFn } from '@axe/application/i18n/translate.token';
import { toHalfWidth } from '@axe/core/util/string-util';
import { normalizeSearchText } from '@axe/core/util/text-search';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import {
  isChatTextHidden,
  readableChatName,
  readableChatText,
} from '@axe/features/chat/chat-message/chat-readable-text';

/**
 * What the reader looks for, in the form search compares: half-width, lowercase and trimmed. The
 * whole of it is looked for as one phrase, spaces and all, as a browser's find does.
 */
export function chatSearchQuery(raw: string): string {
  return normalizeSearchText(raw);
}

/**
 * What a line can be found by: the name it is shown under and its words, as this reader is shown
 * them. The words of a secret roll kept from the reader are left out, so a search cannot give away
 * what it rolled.
 */
export function chatSearchText(message: ChatMessage, canSeeHidden: boolean, translate: TranslateFn): string {
  const hidden = isChatTextHidden(message, canSeeHidden);
  return `${readableChatName(message, translate)}\n${readableChatText(message, hidden, translate)}`;
}

/**
 * The lines of a tab that hold the phrase, oldest first. Only lines this reader is shown count; a
 * line said to somebody else is passed over.
 */
export function findChatSearchHits(
  messages: readonly ChatMessage[],
  query: string,
  textOf: (message: ChatMessage) => string
): ChatMessage[] {
  if (query.length === 0) return [];
  return messages.filter((message) => message.isShownInChat && normalizeSearchText(textOf(message)).includes(query));
}

/**
 * Where the phrase falls in a run of text, as start and end offsets into the text as it is, each
 * place after the last.
 *
 * Text that changes length as it is put in the form search compares is left unmarked, since its
 * offsets no longer line up.
 */
export function chatSearchOffsets(text: string, query: string): [number, number][] {
  if (query.length === 0) return [];
  const comparable = toHalfWidth(text).toLowerCase();
  if (comparable.length !== text.length) return [];
  const offsets: [number, number][] = [];
  for (let at = comparable.indexOf(query); at >= 0; at = comparable.indexOf(query, at + query.length)) {
    offsets.push([at, at + query.length]);
  }
  return offsets;
}

/**
 * Whether a key press asks to find words: Ctrl+F, or ⌘F on a Mac. A keyboard whose F key types
 * another letter still counts by where the key sits.
 */
export function isChatSearchShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
  const key = event.key ?? '';
  return key.toLowerCase() === 'f' || (event.code === 'KeyF' && !/^[a-z]$/i.test(key));
}
