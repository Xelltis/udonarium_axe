import { toHalfWidth } from '@axe/core/util/string-util';
import { withInlineStampsAsSpaces } from '@axe/domain/chat/inline-stamp';

/** The round's presses as a chat line asks for them, each under a short name and a word. */
export const TURN_CHAT_COMMANDS = [
  { command: 'take', short: 'T', word: '手番' },
  { command: 'end', short: 'TE', word: '手番終了' },
  { command: 'wait', short: 'TW', word: '待機' },
  { command: 'stepIn', short: 'TI', word: '割り込み' },
  { command: 'back', short: 'TB', word: '前へ' },
  { command: 'roundStart', short: 'RS', word: 'ラウンド開始' },
  { command: 'roundNext', short: 'RN', word: '次のラウンド' },
  { command: 'roundBack', short: 'RB', word: 'ラウンドを戻す' },
  { command: 'roundReset', short: 'RR', word: 'ラウンドリセット' },
] as const;

/** What a round command does: take a turn, end it, wait, step in, go back a step, or move the round. */
export type TurnChatCommand = (typeof TURN_CHAT_COMMANDS)[number]['command'];

/**
 * Why a round command moves nothing: the seat is only watching, the speaker is no piece, or the
 * round does not stand where the command applies.
 */
export const TURN_CHAT_REFUSALS = [
  'watching',
  'noPiece',
  'fixedOrder',
  'notUnderWay',
  'notInOrder',
  'acted',
  'otherSide',
  'alreadyUp',
  'waiting',
  'nobodyUp',
  'cannotWait',
  'notWaiting',
  'nothingToUndo',
  'underWay',
  'notStarted',
] as const;

/** One reason a round command moves nothing; see {@link TURN_CHAT_REFUSALS}. */
export type TurnChatRefusal = (typeof TURN_CHAT_REFUSALS)[number];

/** A round command read off the start of a line: what it does and where it and the rest of the line stand. */
export interface TurnChatCommandSite {
  readonly command: TurnChatCommand;
  readonly from: number;
  readonly to: number;
  /** Where the rest of the line starts, past the space after the command; the line's end where nothing follows. */
  readonly restFrom: number;
}

const BY_NAME = new Map<string, TurnChatCommand>(
  TURN_CHAT_COMMANDS.flatMap((entry) => [
    [entry.short, entry.command],
    [entry.word, entry.command],
  ])
);

/** The two ways a round command is written, its short name first, each after its ampersand. */
export function turnChatCommandWords(command: TurnChatCommand): [string, string] {
  const entry = TURN_CHAT_COMMANDS.find((candidate) => candidate.command === command)!;
  return [`&${entry.short}`, `&${entry.word}`];
}

/**
 * Reads the round command a line opens with, or null where it opens with none.
 *
 * Only the first word of the line is read, and only where it is an ampersand and one of the names
 * and nothing else: a name that goes on, `&TEAM`, one followed by a buff's fields, `&RS/効果`, and
 * one ending in the mark that takes a buff off, `&RS-`, are left to be read as they always were.
 * A short name is read in either case and in full-width letters, as the ampersand is, and a stamp
 * put right after the word ends it as a space does.
 */
export function readTurnChatCommand(line: string): TurnChatCommandSite | null {
  const opened = /^(\s*)([&＆])(\S+)/.exec(withInlineStampsAsSpaces(line));
  if (!opened) return null;
  const command = BY_NAME.get(opened[3]) ?? BY_NAME.get(toHalfWidth(opened[3]).toUpperCase());
  if (!command) return null;
  const from = opened[1].length;
  const to = from + opened[2].length + opened[3].length;
  return { command, from, to, restFrom: to + /^\s*/.exec(line.slice(to))![0].length };
}

/** The rest of a line after the round command read off its start, to be said as a line of its own. */
export function turnChatCommandRest(line: string, site: TurnChatCommandSite): string {
  return line.slice(site.restFrom);
}
