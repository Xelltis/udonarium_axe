/** The last word of a chat line, read as the cut-in it may start, and where that word stands. */
export interface CutInChatTail {
  name: string;
  soundOnly: boolean;
  from: number;
  to: number;
}

const CHAT_TAIL_PATTERN = /\s(@?)(\S+)$/i;

/**
 * Reads the last word of a line, which starts the cut-in of that name, and an `@` before it, which
 * plays only the cut-in's sound.
 *
 * The word must end the line and follow a space or start it, so a line of one word names its
 * cut-in too, and one with a space after its last word names none.
 */
export function readCutInChatTail(text: string): CutInChatTail | null {
  const match = CHAT_TAIL_PATTERN.exec(` ${text}`);
  if (!match) return null;
  const from = match.index;
  return { name: match[2], soundOnly: match[1] === '@', from, to: from + match[1].length + match[2].length };
}

/**
 * Whether a cut-in can be started by its name ending a line: the name read back as the last word,
 * whole. One with a space in it, or starting with an at mark, cannot.
 */
export function cutInNamedAtLineEnd(name: string): boolean {
  const tail = readCutInChatTail(name);
  return tail !== null && tail.name === name && !tail.soundOnly;
}
