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

/**
 * Finds the `dice:` token in a chat line, or null when there is none. The name may come back empty,
 * meaning whoever spoke.
 */
export function parseDiceChatToken(text: string): DiceChatToken | null {
  const matched = TOKEN_PATTERN.exec(text);
  if (!matched) return null;

  return { name: matched[1].trim() };
}

/** The token added to a palette row. */
export function buildDiceChatToken(name: string): string {
  return `dice:${name.trim()}`;
}
