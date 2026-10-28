/** One change that turns a text into another: what of the old is written over, and with what. */
export interface MinimalEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * The smallest single change from one text to another, leaving alone what they start and end with
 * in common, so that an editor handed the new text keeps its history and the places it has marked.
 * Null where the two are the same.
 */
export function minimalEdit(before: string, after: string): MinimalEdit | null {
  if (before === after) return null;
  let start = 0;
  const shorter = Math.min(before.length, after.length);
  while (start < shorter && before[start] === after[start]) start++;
  let end = 0;
  while (end < shorter - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}
