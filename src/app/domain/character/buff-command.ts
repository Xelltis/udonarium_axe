import { type BuffAppearance, isBuffColorToken, parseBuffAppearance } from '@axe/domain/character/buff-appearance';
import {
  isBuffModifierOperator,
  parseBuffModifierItems,
  parseBuffModifierRequest,
  type ParsedBuffModifierRequest,
} from '@axe/domain/character/buff-modifier';
import type { BuffPileOn } from '@axe/domain/character/buff-stack';
import { isBuffTimingToken, resolveBuffTiming } from '@axe/domain/character/buff-timing';

/**
 * What a `&` buff command does: move every buff's rounds down or up, clear the buffs at nought, take
 * one buff off, lay a buff that moves statuses (`&!`), or lay a plain buff.
 */
export type BuffCommandKind = 'roundsDown' | 'roundsUp' | 'clearZero' | 'remove' | 'calculated' | 'plain';

/**
 * What second helping the command asks for, and the command with that mark taken off.
 *
 * `&+猛攻撃/攻撃+2/3` adds its `+2` to whatever the standing 猛攻撃 already carries instead of
 * writing over it, and `&++猛攻撃/攻撃+2/3` adds the three rounds to the ones left as well. The
 * mark sits right after the ampersand so that everything downstream reads the command it always
 * read, `&+!` included.
 */
export function readBuffStacking(command: string): { piles: BuffPileOn; command: string } {
  const marked = command.match(/^([tTｔＴ]?&)([+＋]{1,2})(?=[^+＋])/);
  if (!marked) return { piles: 'none', command };
  return { piles: marked[2].length > 1 ? 'extend' : 'stack', command: marked[1] + command.slice(marked[0].length) };
}

/** What a buff command, its stacking mark already taken off, does; see {@link BuffCommandKind}. */
export function buffCommandKind(command: string): BuffCommandKind {
  if (/^[tTｔＴ]?&[RＲrｒ]-$/i.test(command)) return 'roundsDown';
  if (/^[tTｔＴ]?&[RＲrｒ][+]$/i.test(command)) return 'roundsUp';
  if (/^[tTｔＴ]?&[DＤdｄ]$/i.test(command)) return 'clearZero';
  if (/^[tTｔＴ]?&.+-$/i.test(command)) return 'remove';
  if (/^[tTｔＴ]?&[!！]/i.test(command)) return 'calculated';
  return 'plain';
}

/** The name of the buff a `&name-` command takes off. */
export function removedBuffName(command: string): string {
  return command.match(/^[tTｔＴ]?&(.+)-$/i)?.[1] ?? '';
}

/**
 * A `&!` command read: the buff's name, the statuses it moves, or null where any of them cannot be
 * read, and the fields after them, its rounds first.
 *
 * The statuses are written either as one status, operator and amount in fields of their own, or as
 * a list in the second field, `攻撃+2,回避-1`.
 */
export interface CalculatedBuffCommand {
  name: string;
  requests: ParsedBuffModifierRequest[] | null;
  rest: string[];
}

/** Reads a `&!` command; see {@link CalculatedBuffCommand}. */
export function readCalculatedBuff(command: string): CalculatedBuffCommand {
  const parts = command.replace(/^[tTｔＴ]?&[!！]/i, '').split('/');
  const name = (parts[0] ?? '').trim();
  const single = isBuffModifierOperator(parts[2] ?? '');
  const requests = single
    ? [parseBuffModifierRequest(parts[1] ?? '', parts[2] ?? '', parts[3] ?? '')]
    : parseBuffModifierItems(parts[1] ?? '');
  const read =
    requests && requests.every((request) => request !== null) ? (requests as ParsedBuffModifierRequest[]) : null;
  return { name, requests: read, rest: parts.slice(single ? 4 : 2) };
}

/**
 * The look written after a `&!` command's rounds. A timing, or a blank where it goes, followed by a
 * bare name stands as it always has, the timing and the piece whose turn it waits for; past those,
 * or written any other way, the fields are read as a plain buff's look is: a colour, an icon, a
 * timing and an `@` trigger, in whichever order they come.
 */
export function readCalculatedBuffLook(fields: readonly string[]): BuffAppearance {
  const [timing = '', trigger = ''] = fields.map((field) => (field ?? '').trim());
  const bare =
    (timing.length < 1 || isBuffTimingToken(timing)) &&
    trigger.length > 0 &&
    !trigger.startsWith('@') &&
    !isBuffColorToken(trigger) &&
    !isBuffTimingToken(trigger);
  if (!bare) return parseBuffAppearance(fields);
  const look = { ...parseBuffAppearance(fields.slice(2)), trigger };
  return timing.length > 0 ? { ...look, timing: resolveBuffTiming(timing)! } : look;
}

/** One `/`-separated field of a buff command, where it stands in the command. */
export interface BuffCommandField {
  text: string;
  from: number;
  to: number;
}

/** The fields of a buff command after its `&`, `t&`, stacking mark and `!`, each where it stands. */
export function buffCommandFields(command: string): BuffCommandField[] {
  const head = /^[tTｔＴ]?[&＆][+＋]{0,2}[!！]?/.exec(command)?.[0] ?? '';
  const fields: BuffCommandField[] = [];
  let at = head.length;
  for (const text of command.slice(head.length).split('/')) {
    fields.push({ text, from: at, to: at + text.length });
    at += text.length + 1;
  }
  return fields;
}
