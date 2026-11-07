import { MAX_ROLL_TARGET_NAME_LENGTH } from '@axe/core/network/server/server-protocol';

/** What stands between the names of everyone a line is aimed at all at once, after its answer. */
export const TOGETHER_SEPARATOR = '、';

/**
 * The targeted character's name after a roll's result, as a room server takes it: on one line, with
 * no brackets or arrows that could pass for more of the result, and no longer than it allows. None
 * for a nameless target.
 */
export function rollTargetSuffix(name: string): string | undefined {
  let line = onOneLine(name);
  if (line.length > MAX_ROLL_TARGET_NAME_LENGTH) {
    line = line.slice(0, MAX_ROLL_TARGET_NAME_LENGTH);
    // A character cut in half is no character.
    if (/[\uD800-\uDBFF]$/.test(line)) line = line.slice(0, -1);
  }
  return line ? ` [${line}]` : undefined;
}

/** What follows the last name that fits after an answer, where the names of everyone it was rolled at do not all fit. */
const MORE_NAMES = `${TOGETHER_SEPARATOR}…`;

/**
 * The names of everyone a line is aimed at all at once after its answer, as a room server takes
 * them: as many whole names as fit, with an ellipsis for the rest, or the first cut short where not
 * even that one fits. None where none of them has a name.
 */
export function rollTogetherSuffix(names: readonly string[]): string | undefined {
  const lines = names.map(onOneLine).filter((line) => line.length > 0);
  const all = lines.join(TOGETHER_SEPARATOR);
  if (all.length <= MAX_ROLL_TARGET_NAME_LENGTH) return all ? ` [${all}]` : undefined;
  let fitted = '';
  for (const line of lines) {
    const longer = fitted ? `${fitted}${TOGETHER_SEPARATOR}${line}` : line;
    if (longer.length + MORE_NAMES.length > MAX_ROLL_TARGET_NAME_LENGTH) break;
    fitted = longer;
  }
  return fitted ? ` [${fitted}${MORE_NAMES}]` : rollTargetSuffix(lines[0]);
}

/** A name on one line, with no brackets or arrows that could pass for more of the result. */
function onOneLine(name: string): string {
  return name
    .replace(/[\r\n]+/g, ' ')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .replace(/→/g, '⇒');
}
