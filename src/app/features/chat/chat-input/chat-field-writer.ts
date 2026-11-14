import { readRollLine, rollableText } from '@axe/domain/dice/dice-roll-line';
import { lineStartOf } from '@axe/features/chat/chat-input/chat-input-helpers';
import type { ChatSyntaxWriter } from '@axe/features/chat/chat-input/chat-syntax-items';
import type { ChatTextField } from '@axe/features/chat/chat-input/chat-text-field';

/**
 * What the toolbar's insert button writes with, into whatever box `write` hands each edit to.
 *
 * `write` is given the edit to make and makes it on the box lines are typed into, where there is
 * one, doing whatever the input does round a change to its text.
 */
export function chatFieldWriter(write: (edit: (field: ChatTextField) => void) => void): ChatSyntaxWriter {
  return {
    insert: (text, select) =>
      write((field) => {
        const { from, to } = field.selection();
        const picked = select ? { from: from + select.from, to: from + select.to } : undefined;
        field.replaceRange(from, to, text, picked);
      }),
    word: (text, select) =>
      write((field) => {
        const { from, to } = field.selection();
        const space = from > 0 && !/\s/.test(field.text()[from - 1]) ? ' ' : '';
        const at = from + space.length;
        const picked = select ? { from: at + select.from, to: at + select.to } : undefined;
        field.replaceRange(from, to, space + text, picked, true);
      }),
    prefix: (text, line = 'caret') =>
      write((field) => {
        const { from, to } = field.selection();
        const lineStart =
          line === 'caret'
            ? lineStartOf(field.text(), from)
            : line === 'roll'
              ? readRollLine(rollableText(field.text().split('\n')[0])).rollFrom
              : 0;
        const shifted = (at: number) => (at < lineStart ? at : at + text.length);
        field.replaceRange(lineStart, lineStart, text, { from: shifted(from), to: shifted(to) }, true);
      }),
    chip: (chip, place) => write((field) => field.insertChip(chip, place)),
  };
}
