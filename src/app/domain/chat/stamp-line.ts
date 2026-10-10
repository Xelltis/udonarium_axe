/**
 * How a line sent with a stamp keeps the words standing in for it: on a line of their own at the end,
 * after whatever was said with it. A version that cannot draw the stamp, a log and a search all read
 * them where the stamp would be, and the dice bot, which reads only the first line, never sees them.
 */

/** The text of a line sent with a stamp: what was said, then the words standing in for the stamp. */
export function joinStampLine(said: string, standIn: string): string {
  return said.length > 0 ? `${said}\n${standIn}` : standIn;
}

/**
 * What was said with a stamp, from the text of its line: all but the last line, which stands in for
 * the stamp. Empty for a stamp sent on its own.
 */
export function saidWithStamp(text: string): string {
  const end = text.lastIndexOf('\n');
  return end < 0 ? '' : text.slice(0, end);
}
