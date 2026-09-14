import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ChatMessage } from '@axe/domain/chat/chat-message';

/**
 * What a line says, in the reader's own language.
 *
 * What the room says of itself - a log cleared, somebody arriving - is kept as a key and its
 * parts rather than as words, so that everyone reads it in their own language. Anything
 * showing such a line has to look the words up, or it shows the key.
 */
export function readableMessageText(message: ChatMessage | null | undefined, translate: TranslateFn): string {
  const text = message?.text ?? '';
  return message?.isSystemMessage ? decodeI18nMessage(text, translate) : text;
}

/** The name a line is spoken under, read the same way. */
export function readableMessageName(message: ChatMessage | null | undefined, translate: TranslateFn): string {
  const name = message?.name ?? '';
  return message?.isSystemMessage ? decodeI18nMessage(name, translate) : name;
}
