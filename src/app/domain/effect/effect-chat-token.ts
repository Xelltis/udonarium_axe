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

/**
 * The token that plays a line as an exchange on the battle stage rather than naming an effect.
 * Read in either width and either case.
 */
export const BATTLE_CHAT_TOKEN = '《vs》';

/** Whether a token's name is the battle stage's own rather than an effect's. */
export function isBattleChatTokenName(name: string): boolean {
  return name.normalize('NFKC').trim().toLowerCase() === 'vs';
}

/** A `《name》` token in a line and where it stands, brackets included. */
export interface EffectTokenSite {
  /** The name inside, without the spaces around it. */
  name: string;
  from: number;
  to: number;
  /** Whether it is the battle stage's token rather than an effect's. */
  battle: boolean;
}

/**
 * Every `《name》` token in a line, in order, leaving out the readings of its rubies. A token with
 * nothing but spaces inside has an empty name.
 */
export function effectTokenSites(text: string): EffectTokenSite[] {
  const sites: EffectTokenSite[] = [];
  for (const matched of text.matchAll(RUBY_OR_TOKEN)) {
    const token = matched[3];
    if (token === undefined) continue;
    const name = token.trim();
    sites.push({
      name,
      from: matched.index,
      to: matched.index + matched[0].length,
      battle: isBattleChatTokenName(name),
    });
  }
  return sites;
}

/** A ruby, or a `《name》` token, a text ends with, and where it starts. */
export type EndingChatNotation =
  | { readonly kind: 'ruby'; readonly from: number; readonly base: string; readonly reading: string }
  | { readonly kind: 'token'; readonly from: number; readonly name: string };

/**
 * The ruby or the `《name》` token a text ends with, read from the left as the chat reads the line,
 * so that a reading its ruby takes up is no token and a ruby splits where the chat splits it; null
 * where the text ends with neither.
 */
export function chatNotationEnding(text: string): EndingChatNotation | null {
  let last: RegExpExecArray | undefined;
  for (const matched of text.matchAll(RUBY_OR_TOKEN)) last = matched;
  if (!last || last.index + last[0].length !== text.length) return null;
  return last[3] === undefined
    ? { kind: 'ruby', from: last.index, base: last[1], reading: last[2] }
    : { kind: 'token', from: last.index, name: last[3].trim() };
}

/**
 * Takes the first effect token out of a line. Null when there is none. The battle stage's token
 * names no effect, so it is passed over; a token with nothing in it ends the search.
 */
export function parseEffectChatToken(text: string): EffectChatToken | null {
  for (const site of effectTokenSites(text)) {
    if (site.name.length < 1) return null;
    if (site.battle) continue;
    return { name: site.name, text: stripEffectChatTokens(text) };
  }
  return null;
}

/** Whether a line asks to be played on the battle stage, by the battle stage's token anywhere in it. */
export function hasBattleChatToken(text: string): boolean {
  return effectTokenSites(text).some((site) => site.battle);
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
