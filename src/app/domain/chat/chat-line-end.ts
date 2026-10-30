import { portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import type { ChatRichChip } from '@axe/domain/chat/chat-rich-text';
import { readCutInChatTail } from '@axe/domain/media/cut-in-chat-tail';

/** A text with something written into its end, and the caret just after what was written. */
export interface WrittenAtLineEnd {
  readonly text: string;
  readonly caret: number;
}

/**
 * Writes a piece of syntax at the end of a message, where a sent line is read for the portrait
 * command it ends with and then, that taken off, for the cut-in its last word names; only one of
 * each is read there.
 *
 * A portrait goes in place of the portrait command the text ends with, and last where there is
 * none. A cut-in goes in place of the cut-in, one of `cutInNames`, that ends the text before any
 * portrait command, and otherwise just before that portrait command, or last. Anything else goes
 * last. What goes last, or before a portrait command, goes after a space where it would run on
 * from a word.
 */
export function writtenAtLineEnd(
  text: string,
  raw: string,
  kind: ChatRichChip['kind'],
  cutInNames: ReadonlySet<string>
): WrittenAtLineEnd {
  const over = (from: number, to: number): WrittenAtLineEnd => ({
    text: text.slice(0, from) + raw + text.slice(to),
    caret: from + raw.length,
  });
  const after = (head: string): WrittenAtLineEnd => {
    const space = head.length > 0 && !/\s$/.test(head) ? ' ' : '';
    const rest = text.slice(head.length);
    const gap = rest.length > 0 && !/^\s/.test(rest) ? ' ' : '';
    return { text: head + space + raw + gap + rest, caret: head.length + space.length + raw.length };
  };

  const portrait = portraitCommandSite(text);
  if (kind === 'portrait') return portrait ? over(portrait.from, portrait.to) : after(text);
  if (kind !== 'cutIn') return after(text);
  const head = portrait ? text.slice(0, portrait.from).trimEnd() : text;
  const cutIn = readCutInChatTail(head);
  if (cutIn && cutInNames.has(cutIn.name)) return over(cutIn.from, cutIn.to);
  return after(head);
}
