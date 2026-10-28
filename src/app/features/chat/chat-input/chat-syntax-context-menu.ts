import type { TranslateFn } from '@axe/application/i18n/translate.token';
import { type ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import type { ChatTagLanguage } from '@axe/domain/chat/chat-decoration';
import {
  buildChatDecorationMenu,
  type ChatDecorationMarks,
} from '@axe/features/chat/chat-input/chat-decoration-context-menu';

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

/** How the menu writes into the line. */
export interface ChatSyntaxWriter {
  /** Wraps what is selected in the marks, keeping it selected. */
  wrap(marks: ChatDecorationMarks): void;
  /**
   * Writes text over what is selected, or at the caret, and selects the stretch of it given, or puts
   * the caret after it.
   */
  insert(text: string, select?: { from: number; to: number }): void;
  /** Writes text at the end of the line, after a space, where what ends a line is read. */
  append(text: string): void;
  /** Writes text at the start of the line, where what begins a line is read. */
  prefix(text: string): void;
}

/** The text written with a stretch of it selected, for the reader to type over. */
function placeholder(writer: ChatSyntaxWriter, before: string, hole: string, after = ''): void {
  writer.insert(before + hole + after, { from: before.length, to: before.length + hole.length });
}

/**
 * The syntax the chat input's button offers, a group to each kind: decorations, ruby, dice,
 * references, resource and buff changes, portraits, and effects and cut-ins. Each item is named with
 * what it writes, so that a reader who picks from it learns to write the same by hand; one that
 * needs a name or an amount writes a word in its place, selected to be typed over.
 *
 * A group the speaker or the room has nothing for is left out, as are the sweeps a player cannot use.
 */
export function buildChatSyntaxMenu(
  source: ChatSyntaxMenuSource,
  writer: ChatSyntaxWriter,
  t: TranslateFn
): ContextMenuAction[] {
  const word = (key: string) => t(`feature.chat.syntax.${key}`);
  const named = (label: string, written: string) => `${label}　${written}`;
  const menu: ContextMenuAction[] = [];
  const group = (key: string, subActions: ContextMenuAction[]) => {
    if (subActions.length > 0) menu.push({ name: word(key), subActions });
  };

  group(
    'decoration',
    buildChatDecorationMenu(source.language, (marks) => writer.wrap(marks), t)
  );
  group('ruby', [
    {
      name: named(word('rubyWrap'), `|${word('base')}《${word('reading')}》`),
      action: () => writer.wrap({ open: '|', close: '《》' }),
    },
  ]);

  group('dice', [
    ...['2D6', '1D100', 'choice[A,B,C]'].map((command) => ({
      name: command,
      action: () => writer.insert(`${command} `),
    })),
    ...(source.diceExamples.length > 0 ? [ContextMenuSeparator] : []),
    ...source.diceExamples.map((command) => ({ name: command, action: () => writer.insert(`${command} `) })),
    ContextMenuSeparator,
    { name: named(word('secretRoll'), 'S2D6'), action: () => writer.prefix('S') },
    { name: named(word('repeat'), 'x3 2D6'), action: () => writer.prefix('x3 ') },
  ]);

  const referable = [...source.statuses.map((status) => status.name), ...source.variables];
  group('reference', [
    ...referable.map((name) => ({ name: `{${name}}`, action: () => writer.insert(`{${name}}`) })),
    ...(referable.length > 0 ? [ContextMenuSeparator] : []),
    {
      name: named(word('targetReference'), `t{${word('name')}}`),
      action: () => placeholder(writer, 't{', word('name'), '}'),
    },
  ]);

  group('resource', [
    ...source.statuses.map((status) => ({
      name: status.name,
      subActions: [
        { name: `:${status.name}-`, action: () => placeholder(writer, `:${status.name}-`, '1') },
        { name: `:${status.name}+`, action: () => placeholder(writer, `:${status.name}+`, '1') },
        { name: `:${status.name}=`, action: () => placeholder(writer, `:${status.name}=`, '1') },
        ...(status.isResource
          ? [{ name: `:${status.name}^+`, action: () => placeholder(writer, `:${status.name}^+`, '1') }]
          : [{ name: `:${status.name}>`, action: () => placeholder(writer, `:${status.name}>`, word('text')) }]),
      ],
    })),
    ...(source.statuses.length > 0 ? [ContextMenuSeparator] : []),
    { name: named(word('toTarget'), `t:HP-1`), action: () => placeholder(writer, 't:', 'HP', '-1') },
    { name: named(word('secret'), `s:HP-1`), action: () => placeholder(writer, 's:', 'HP', '-1') },
  ]);

  group('buff', [
    {
      name: named(word('buffPlain'), `&${word('name')}/${word('buffEffect')}/3`),
      action: () => placeholder(writer, '&', word('name'), `/${word('buffEffect')}/3`),
    },
    {
      name: named(word('buffCalculated'), `&!${word('name')}/HP/+/1/3`),
      action: () => placeholder(writer, '&!', word('name'), '/HP/+/1/3'),
    },
    {
      name: named(word('buffRemove'), `&${word('name')}-`),
      action: () => placeholder(writer, '&', word('name'), '-'),
    },
    { name: named(word('buffRoundsDown'), '&R-'), action: () => writer.insert('&R- ') },
    { name: named(word('buffClear'), '&D'), action: () => writer.insert('&D ') },
    ...(source.isGameMaster
      ? [
          {
            name: named(word('buffSweep'), `&&${word('name')}-`),
            action: () => placeholder(writer, '&&', word('name'), '-'),
          },
        ]
      : []),
  ]);

  group('portrait', [
    ...source.portraits
      .filter((label) => label.trim().length > 0)
      .map((label) => ({ name: `@${label}`, action: () => writer.append(`@${label}`) })),
    { name: named(word('portraitHide'), '@hide'), action: () => writer.append('@hide') },
  ]);

  group('effect', [
    ...source.effects.map((name) => ({ name: `《${name}》`, action: () => writer.insert(`《${name}》`) })),
    { name: named(word('battle'), '《vs》'), action: () => writer.insert('《vs》') },
    ...(source.cutIns.length > 0 ? [ContextMenuSeparator] : []),
    ...source.cutIns.map((name) => ({ name: named(word('cutIn'), name), action: () => writer.append(name) })),
  ]);

  group('quote', [{ name: named(word('quoteLine'), '> '), action: () => writer.prefix('> ') }]);
  return menu;
}
