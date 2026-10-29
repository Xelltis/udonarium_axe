import type { TranslateFn } from '@axe/application/i18n/translate.token';
import type { ChatTagLanguage } from '@axe/domain/chat/chat-decoration';
import type { ChatRichChip } from '@axe/domain/chat/chat-rich-text';
import { isBattleChatTokenName } from '@axe/domain/effect/effect-chat-token';
import type { ChatChipPlace, ChatFieldSelection } from '@axe/features/chat/chat-input/chat-text-field';

/** What the speaker and the room offer to be written, each by the name it is written with. */
export interface ChatSyntaxMenuSource {
  readonly language: ChatTagLanguage;
  /** The statuses on the speaker's sheet, and whether each is a resource with a maximum. */
  readonly statuses: readonly { name: string; isResource: boolean }[];
  /** The variables of the speaker's palette. */
  readonly variables: readonly string[];
  readonly portraits: readonly string[];
  readonly effects: readonly string[];
  /** The cut-ins that start from chat. */
  readonly cutIns: readonly string[];
  /** Commands of the game system that roll as they stand. */
  readonly diceExamples: readonly string[];
  readonly isGameMaster: boolean;
}

/** How the items write into the line. */
export interface ChatSyntaxWriter {
  /** Writes text over what is selected, or at the caret, selecting the stretch of it given, or putting the caret after it. */
  insert(text: string, select?: ChatFieldSelection): void;
  /**
   * Writes text at the start of a line, where what begins one is read: the line the caret is on;
   * the first line of the message, the only one the dice bot reads a roll from; or the start of the
   * roll on it, after any count of repeats it starts with.
   */
  prefix(text: string, line?: 'caret' | 'first' | 'roll'): void;
  /** Puts in a piece of syntax shown whole, at the caret or at the end of the message. */
  chip(chip: ChatRichChip, place: ChatChipPlace): void;
}

/** One thing to write: what it is called, the syntax it writes, and the writing of it. */
export interface ChatSyntaxItem {
  readonly label: string;
  readonly written: string;
  run(): void;
}

/** A row of the list: one thing to write, or one name with several ways to write it, as a status has. */
export interface ChatSyntaxRow {
  readonly label: string;
  readonly items: readonly ChatSyntaxItem[];
}

export type ChatSyntaxGroupKey = 'dice' | 'reference' | 'resource' | 'buff' | 'portrait' | 'effect' | 'quote';

/** A kind of syntax and the rows of it there are to write. */
export interface ChatSyntaxGroup {
  readonly key: ChatSyntaxGroupKey;
  readonly label: string;
  readonly rows: readonly ChatSyntaxRow[];
}

/** A row of a single thing to write, named by the syntax it writes where it has no name of its own. */
function single(label: string, written: string, run: () => void): ChatSyntaxRow {
  return { label, items: [{ label, written, run }] };
}

/** Text written with a stretch of it selected, for the reader to type over. */
function withHole(writer: ChatSyntaxWriter, before: string, hole: string, after = ''): () => void {
  return () => writer.insert(before + hole + after, { from: before.length, to: before.length + hole.length });
}

/**
 * The syntax the input's insert button offers, a group to each kind: dice, references, resource and
 * buff changes, portraits, effects and cut-ins, and quotes. Each row is named with what it writes, so
 * that a reader who picks from it learns to write the same by hand, and writes it where it is read:
 * at the caret with a word to type over selected, at the start of the line, or as a chip at the end
 * of the message. A group the speaker or the room has nothing for is left out, as is the sweep a
 * player cannot use.
 */
export function chatSyntaxGroups(
  source: ChatSyntaxMenuSource,
  writer: ChatSyntaxWriter,
  t: TranslateFn
): ChatSyntaxGroup[] {
  const word = (key: string) => t(`feature.chat.syntax.${key}`);
  const groups: ChatSyntaxGroup[] = [];
  const group = (key: ChatSyntaxGroupKey, rows: ChatSyntaxRow[]) => {
    if (rows.length > 0) groups.push({ key, label: word(key), rows });
  };

  group('dice', [
    ...['2D6', '1D100', 'choice[A,B,C]', ...source.diceExamples].map((command) =>
      single(command, command, () => writer.insert(`${command} `))
    ),
    single(word('secretRoll'), 'S2D6', () => writer.prefix('S', 'roll')),
    single(word('repeat'), 'x3 2D6', () => writer.prefix('x3 ', 'first')),
  ]);

  const reference = (name: string, targeted: boolean): ChatSyntaxItem => {
    const raw = `${targeted ? 't' : ''}{${name}}`;
    return {
      label: targeted ? 't{}' : '{}',
      written: raw,
      run: () => writer.chip({ kind: 'reference', raw, name, targeted, useMax: false }, 'caret'),
    };
  };
  group('reference', [
    ...[...source.statuses.map((status) => status.name), ...source.variables].map((name) => ({
      label: name,
      items: [reference(name, false), reference(name, true)],
    })),
    single(word('targetReference'), `t{${word('name')}}`, () => writer.insert('t{}', { from: 2, to: 2 })),
  ]);

  group('resource', [
    ...source.statuses.map((status) => ({
      label: status.name,
      items: [
        { label: '-', written: `:${status.name}-1`, run: withHole(writer, `:${status.name}-`, '1') },
        { label: '+', written: `:${status.name}+1`, run: withHole(writer, `:${status.name}+`, '1') },
        { label: '=', written: `:${status.name}=1`, run: withHole(writer, `:${status.name}=`, '1') },
        status.isResource
          ? { label: '^+', written: `:${status.name}^+1`, run: withHole(writer, `:${status.name}^+`, '1') }
          : { label: '>', written: `:${status.name}>`, run: withHole(writer, `:${status.name}>`, word('text')) },
      ],
    })),
    single(word('toTarget'), 't:HP-1', withHole(writer, 't:', 'HP', '-1')),
    single(word('secret'), 's:HP-1', withHole(writer, 's:', 'HP', '-1')),
  ]);

  group('buff', [
    single(
      word('buffPlain'),
      `&${word('name')}/${word('buffEffect')}/3`,
      withHole(writer, '&', word('name'), `/${word('buffEffect')}/3`)
    ),
    single(word('buffCalculated'), `&!${word('name')}/HP/+/1/3`, withHole(writer, '&!', word('name'), '/HP/+/1/3')),
    single(word('buffRemove'), `&${word('name')}-`, withHole(writer, '&', word('name'), '-')),
    single(word('buffRoundsDown'), '&R-', () => writer.insert('&R- ')),
    single(word('buffClear'), '&D', () => writer.insert('&D ')),
    ...(source.isGameMaster
      ? [single(word('buffSweep'), `&&${word('name')}-`, withHole(writer, '&&', word('name'), '-'))]
      : []),
  ]);

  group('portrait', [
    ...source.portraits
      .filter((label) => label.trim().length > 0)
      .map((label) =>
        single(label, `@${label}`, () =>
          writer.chip({ kind: 'portrait', raw: `@${label}`, command: { type: 'name', name: label } }, 'end')
        )
      ),
    single(word('portraitHide'), '@hide', () =>
      writer.chip({ kind: 'portrait', raw: '@hide', command: { type: 'hide' } }, 'end')
    ),
  ]);

  group('effect', [
    ...[...source.effects, 'vs'].map((name) =>
      single(name === 'vs' ? word('battle') : name, `《${name}》`, () =>
        writer.chip({ kind: 'effect', raw: `《${name}》`, name, battle: isBattleChatTokenName(name) }, 'caret')
      )
    ),
    ...source.cutIns.map((name) =>
      single(name, name, () => writer.chip({ kind: 'cutIn', raw: name, name, soundOnly: false }, 'end'))
    ),
  ]);

  group('quote', [single(word('quoteLine'), '> ', () => writer.prefix('> '))]);
  return groups;
}
