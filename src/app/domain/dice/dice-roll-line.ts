/**
 * A chat line read the way the dice bot reads it before rolling: a leading count of repeats, and the
 * rest of the first line, which is what the game system is asked to roll.
 */
export interface RollLine {
  /** How many times the command is rolled; 1 when no count leads the line. */
  repeat: number;
  /** What the game system is handed, with the count and the space after it taken off. */
  rollText: string;
  /** Where {@link rollText} starts in the line. */
  rollFrom: number;
}

/**
 * Splits a line, already in half-width, into its repeat count and the command after it.
 *
 * A count is digits followed by spaces at the very start; a line that starts with a space has a
 * count of one. Only the first line of what follows is handed on. When nothing follows the count,
 * the whole text is handed on instead.
 */
export function readRollLine(text: string): RollLine {
  const match = /^((\d+)?\s+)?(.*)?/.exec(text)!;
  const repeat = match[2] != null ? Number(match[2]) : 1;
  if (match[3] == null) return { repeat, rollText: text, rollFrom: 0 };
  return { repeat, rollText: match[3], rollFrom: match[1]?.length ?? 0 };
}

/**
 * Whether text may be a dice command where there is no game system to ask: its first word holds a
 * digit or one of `<>=[(`, and is not a resource or buff change, which begins with `:` or `&` after
 * an optional `s` or `t`.
 */
export function looksLikeDiceCommand(text: string): boolean {
  const firstWord = /^\S*/.exec(text)?.[0] ?? '';
  if (/^[sｓＳ]?[tｔＴ]?[:：&＆]/i.test(firstWord)) return false;
  return /[\d<>=[(]/.test(firstWord);
}

/**
 * Whether a word is shaped like a roll in any game system: printable ASCII only, starting with a
 * digit or bracket, or with a few letters followed by a digit, a comparison, a bracket, an operator
 * or one of `@#$`. `2d6+3`, `CC<=50` and `K20@9` are; `1日目`, `hello` and `{HP}` are not.
 */
export function looksLikeRollWord(word: string): boolean {
  return /^[\x21-\x7E]+$/.test(word) && /^(?:[0-9([]|[A-Za-z]{1,8}[0-9<>=([+\-*/@#$])/.test(word);
}
