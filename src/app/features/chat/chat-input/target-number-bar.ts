import type { ChatLintTargetNumber } from '@axe/application/chat/chat-lint.service';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import { rolledOf, rollerOf, type TargetNumberFrom } from '@axe/domain/chat/target-number';

/** A line of the bar, as a translation key and what goes into it. */
export interface TargetNumberBarLabel {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/** An answer offered in the bar to fill a `{目標値}` with, by the identifier the pick is kept under. */
export interface TargetNumberBarChoice {
  readonly identifier: string;
  readonly label: TargetNumberBarLabel;
  /** The answer as the dice bot wrote it, shown on pointing at it. */
  readonly title: string;
}

/** What the bar over a chat input shows of the number a `{目標値}` in the line is filled in with. */
export interface TargetNumberBar {
  /** The first choice, filling it in with the number found: what it is and where it was found. */
  readonly found: TargetNumberBarLabel;
  /** The answer picked instead, by its identifier; empty while the one found is used. */
  readonly chosen: string;
  readonly choices: readonly TargetNumberBarChoice[];
  /** Whether the number found is the tab's own, set from an answer, which the reader may take off from here. */
  readonly unpinnable: boolean;
}

const FOUND_KEYS: Readonly<Record<TargetNumberFrom, string>> = {
  aimed: 'feature.chat.input.targetNumberAimed',
  pinned: 'feature.chat.input.targetNumberPinned',
  byOthers: 'feature.chat.input.targetNumberByOthers',
};

/**
 * The bar for a `{目標値}` left in a line: the number found and where it came from, which a line
 * aimed at the speaker names them for, and each answer that may be picked instead. The tab's own
 * number to beat may be taken off from it by a reader who may set it.
 */
export function targetNumberBarOf(number: ChatLintTargetNumber, speaker: string, mayPin: boolean): TargetNumberBar {
  const found = number.found;
  return {
    unpinnable: mayPin && found?.from === 'pinned',
    found: found
      ? { key: FOUND_KEYS[found.from], params: { total: found.total, by: rolledBy(found.answer), speaker } }
      : { key: 'feature.chat.input.targetNumberNotFound', params: {} },
    chosen: number.chosen?.answer.identifier ?? '',
    choices: number.choices.map((choice) => ({
      identifier: choice.answer.identifier,
      label: {
        key: 'feature.chat.input.targetNumberChoice',
        params: { total: choice.total, by: rolledBy(choice.answer) },
      },
      title: `${choice.answer.text ?? ''}`,
    })),
  };
}

/** Who rolled an answer and what they rolled, as the bar names it. */
function rolledBy(answer: ChatMessage): string {
  return [rollerOf(answer), rolledOf(answer)].filter((part) => part.length > 0).join(' ');
}
