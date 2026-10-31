import { withInlineStampsAsSpaces } from '@axe/domain/chat/inline-stamp';

/**
 * The dice token written into a line of chat.
 *
 * `2d6 dice:ゴブリンA` rolls the command as it always did and then puts what the dice
 * showed onto the dice that piece keeps on the table, so the table and the log agree.
 *
 * The name may be left off — `2d6 dice:` — in which case the dice belong to whoever spoke
 * the line. It reads as the resource changes do, and collides with neither them nor the
 * effect brackets.
 */

const TOKEN_PATTERN = /(?:^|[\s\u3000])dice:([^\s\u3000]*)/i;

export interface DiceChatToken {
  /** The piece whose dice are meant. Empty for whoever spoke the line. */
  name: string;
}

/** Where the `dice:` token stands in a line, from its `d` to the end of the name. */
export interface DiceChatTokenSite extends DiceChatToken {
  from: number;
  to: number;
}

/**
 * Finds the `dice:` token in a chat line and where it stands, or null when there is none. A stamp
 * put inside the line ends the name, as a space does.
 */
export function diceChatTokenSite(text: string): DiceChatTokenSite | null {
  const matched = TOKEN_PATTERN.exec(withInlineStampsAsSpaces(text));
  if (!matched) return null;
  const to = matched.index + matched[0].length;
  return { name: matched[1].trim(), from: to - matched[1].length - 'dice:'.length, to };
}

/**
 * Finds the `dice:` token in a chat line, or null when there is none. The name may come back empty,
 * meaning whoever spoke.
 */
export function parseDiceChatToken(text: string): DiceChatToken | null {
  const site = diceChatTokenSite(text);
  return site ? { name: site.name } : null;
}

/** The token added to a palette row. */
export function buildDiceChatToken(name: string): string {
  return `dice:${name.trim()}`;
}
