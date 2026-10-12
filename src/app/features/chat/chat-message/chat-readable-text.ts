import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { readingOf, RUBY_NOTATION } from '@axe/domain/chat/chat-ruby-notation';
import { vnBodyOf } from '@axe/domain/visual-novel/vn-emote';

/**
 * Whether the words of a line are kept from this reader: a secret roll is, until it is disclosed,
 * from everyone but the one who rolled it and those who may see what is hidden.
 */
export function isChatTextHidden(message: ChatMessage, canSeeHidden: boolean): boolean {
  return message.isSecret && !message.isSendFromSelf && !canSeeHidden;
}

/** The `\s` the chat writes a space as. */
const ESCAPED_SPACE = /\\s/g;

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
  return vnBodyOf(message.vnEmote, text)
    .replace(RUBY_NOTATION, (_, base: string, reading: string) => `${base}（${readingOf(reading)}）`)
    .replace(ESCAPED_SPACE, ' ')
    .trim();
}

/** The name a line is shown under; a notice from the room is read in the reader's language. */
export function readableChatName(message: ChatMessage, translate: TranslateFn): string {
  const name = message.name ?? '';
  return message.isSystemMessage ? decodeI18nMessage(name, translate) : name;
}
