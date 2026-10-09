/**
 * The effect token written into a line of chat.
 *
 * Written after the roll and the damage, the effect plays after both.
 * The double brackets are free in the chat notation, as the novel mode's own brackets
 * are, so they collide with neither the dice nor the resource changes. The one other use
 * they have is the reading of a ruby, `|word《reading》`, which is never a token.
 */

import { RUBY_NOTATION } from '@axe/domain/chat/chat-ruby-notation';

/**
 * A ruby, or a token with its name as the third group.
 *
 * Both are read from the left in one pass, so a reading is taken up by its ruby before it
 * could be read as a token.
 */
const RUBY_OR_TOKEN = new RegExp(`${RUBY_NOTATION.source}|《([^《》]+)》`, 'g');

export interface EffectChatToken {
  /** The name of the effect called for. */
  name: string;
  /** The line with the token taken out. */
  text: string;
}

/** Takes the first effect token out of a line. Null when there is none. */
export function parseEffectChatToken(text: string): EffectChatToken | null {
  for (const matched of text.matchAll(RUBY_OR_TOKEN)) {
    const token = matched[3];
    if (token === undefined) continue;

    const name = token.trim();
    if (name.length < 1) return null;

    return { name, text: stripEffectChatTokens(text) };
  }
  return null;
}

/** Takes every effect token out of a line, leaving its rubies as they are. */
export function stripEffectChatTokens(text: string): string {
  return text
    .replace(RUBY_OR_TOKEN, (matched, _word, _reading, token) => (token === undefined ? matched : ''))
    .replace(/[\s\u3000]{2,}/g, ' ')
    .trim();
}

/** The token added to a palette row. */
export function buildEffectChatToken(name: string): string {
  return `《${name}》`;
}
