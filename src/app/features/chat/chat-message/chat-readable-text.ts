import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { vnBodyOf } from '@axe/domain/visual-novel/vn-emote';
import { splitRubyNotation } from '@axe/ui/text-decoration/decorate-chat-text';

/**
 * Whether the words of a line are kept from this reader: a secret roll is, until it is disclosed,
 * from everyone but the one who rolled it and those who may see what is hidden.
 */
export function isChatTextHidden(message: ChatMessage, canSeeHidden: boolean): boolean {
  return message.isSecret && !message.isSendFromSelf && !canSeeHidden;
}

/**
 * The words of a line as this reader is shown them, as plain text, or nothing where they are kept
 * from the reader.
 *
 * A notice from the room is read in the reader's language. Ruby comes out as the words with their
 * reading after them in brackets, since plain text cannot set a reading over its words, and the
 * log saved from chat keeps the reading as well.
 */
export function readableChatText(message: ChatMessage, hidden: boolean, translate: TranslateFn): string {
  if (hidden) return '';
  const text = message.isSystemMessage ? decodeI18nMessage(message.text, translate) : (message.text ?? '');
  return splitRubyNotation(vnBodyOf(message.vnEmote, text))
    .map((part) => (part.reading.length > 0 ? `${part.text}（${part.reading}）` : part.text))
    .join('')
    .trim();
}

/** The name a line is shown under; a notice from the room is read in the reader's language. */
export function readableChatName(message: ChatMessage, translate: TranslateFn): string {
  const name = message.name ?? '';
  return message.isSystemMessage ? decodeI18nMessage(name, translate) : name;
}
