import { MAX_ROLL_TARGET_NAME_LENGTH } from '@axe/core/network/server/server-protocol';

/**
 * The targeted character's name after a roll's result, as a room server takes it: on one line, with
 * no brackets or arrows that could pass for more of the result, and no longer than it allows. None
 * for a nameless target.
 */
export function rollTargetSuffix(name: string): string | undefined {
  let line = name
    .replace(/[\r\n]+/g, ' ')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .replace(/→/g, '⇒');
  if (line.length > MAX_ROLL_TARGET_NAME_LENGTH) {
    line = line.slice(0, MAX_ROLL_TARGET_NAME_LENGTH);
    // A character cut in half is no character.
    if (/[\uD800-\uDBFF]$/.test(line)) line = line.slice(0, -1);
  }
  return line ? ` [${line}]` : undefined;
}
