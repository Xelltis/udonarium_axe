import { portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import type { ChatRichChip } from '@axe/domain/chat/chat-rich-text';
import { readCutInChatTail } from '@axe/domain/media/cut-in-chat-tail';

/** A text with something written into its end, and the caret just after what was written. */
export interface WrittenAtLineEnd {
  readonly text: string;
  readonly caret: number;
}

/**
 * Writes a piece of syntax at the end of a message, where a sent line is read for one command: the
 * portrait command it ends with, or, where there is none, the cut-in its last word names. Stamps
 * after either are passed over as they are read.
 *
 * A portrait or a cut-in goes in place of whichever of those the text ends with, a cut-in one of
 * `cutInNames`, and last where there is none. A cut-in put in place of one keeps the stamps after
 * it with no space before them, as a cut-in's name followed by a space is not read. Anything else
 * goes last. What goes last goes after a space where it would run on from a word.
 */
export function writtenAtLineEnd(
  text: string,
  raw: string,
  kind: ChatRichChip['kind'],
  cutInNames: ReadonlySet<string>
): WrittenAtLineEnd {
  const portrait = portraitCommandSite(text);
  const cutIn = portrait ? null : readCutInChatTail(text);
  const tail = portrait ?? (cutIn && cutInNames.has(cutIn.name) ? cutIn : null);
  if (tail && (kind === 'portrait' || kind === 'cutIn')) {
    const rest = text.slice(tail.to);
    return {
      text: text.slice(0, tail.from) + raw + (kind === 'cutIn' ? rest.replace(/\s+/g, '') : rest),
      caret: tail.from + raw.length,
    };
  }
  const space = text.length > 0 && !/\s$/.test(text) ? ' ' : '';
  return { text: text + space + raw, caret: text.length + space.length + raw.length };
}
