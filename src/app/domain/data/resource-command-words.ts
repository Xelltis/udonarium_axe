import { parseBuffRemovalCommand } from '@axe/domain/character/buff-bulk-removal';
import type { DefaultPick } from '@axe/domain/character/default-value';
import { withInlineStampsAsSpaces } from '@axe/domain/chat/inline-stamp';
import { readNamedResourceSlot } from '@axe/domain/data/resource-slot';
import { readTurnChatCommand } from '@axe/domain/tabletop/turn-chat-command';

/** One command picked out of a chat line, in the form it is carried out in, and where it was typed. */
export interface ResourceCommandSite {
  command: string;
  from: number;
  to: number;
  /** Where it starts with the `s` that keeps it secret counted in; {@link from} where it has none. */
  markFrom: number;
}

/** The `:` resource, `&` buff and `&&` sweep commands a chat line holds, in the order they were typed. */
export interface ResourceCommandWords {
  /** Whether an `s:`, `st:`, `s&` or `st&` asks for the report to be a secret. */
  secret: boolean;
  sweeps: ResourceCommandSite[];
  resources: ResourceCommandSite[];
  buffs: ResourceCommandSite[];
}

/**
 * What follows the ampersand of a buff command an `s` before it keeps secret: a buff laid with its
 * fields, one taken off, rounds moved, the buffs at nought cleared, or one that moves statuses. A
 * bare name is not, as `s&p` reads as a word as well.
 */
const SECRET_BUFF_SHAPE = String.raw`(?:[+＋]{0,2}[!！]|[RrＲｒ][-+＋－](?=\s|$)|[DdＤｄ](?=\s|$)|\S*[/／]|\S*[-－](?=\s|$))`;

/** A `&&` sweep, which ends with a minus and reads as no word. */
const SWEEP_SHAPE = String.raw`[&＆]{2}\S+[-－](?=\s|$)`;

/**
 * The `s` that makes a command secret: before a resource command or a sweep in either case, and
 * before a buff command in lower case alone, so that words such as `S&W` and `s&p` stay words.
 */
const SECRET_MARK = new RegExp(
  String.raw`\s(?:[sSｓＳ][tTｔＴ]?[:：]|[sｓ][tTｔＴ]?[&＆]${SECRET_BUFF_SHAPE}|[sSｓＳ]${SWEEP_SHAPE})`
);
const SECRET_PREFIX = new RegExp(
  String.raw`(\s)(?:[sSｓＳ](?=[tTｔＴ]?[:：]|${SWEEP_SHAPE})|[sｓ](?=[tTｔＴ]?[&＆]${SECRET_BUFF_SHAPE}))`,
  'g'
);

/**
 * Whether a line holds a secret resource or buff command: an `s:`, `st:`, `s&` or `st&` that starts a
 * word, a stamp put inside the line ending a word as a space does.
 */
export function hasSecretEditMark(text: string): boolean {
  return SECRET_MARK.test(` ${withInlineStampsAsSpaces(text)}`);
}

/**
 * Picks the resource, buff and sweep commands out of a chat line, with where each stands in it.
 *
 * Full-width marks are read as half-width ones, and the `s` in front of a word's first `:`, `t:`,
 * `&` or `t&` is taken off, the rest of the word then read as any other. Each word is a sweep, or
 * else, when it starts with `:`, `&`, `t:` or `t&`, splits into the commands each mark begins. A
 * `:` that starts a status in a buff's fields, as in `&!毒/:HP/+/0~-3/3`, marks the status to stay
 * moved and begins no command of its own, and neither does the `:` of a field telling when the buff's
 * effect moves, `発生:手番終了`. A word that starts any other way holds no command. A stamp
 * put inside the line ends a word as a space does, so one put right after a command is never read as
 * part of it. A round command the line opens with, `&T`, is the round's to carry out and lays no
 * buff.
 */
export function resourceCommandSites(text: string): ResourceCommandWords {
  const padded = ` ${withInlineStampsAsSpaces(text)}`;
  const rawAt: number[] = [];
  for (let index = 0; index < padded.length; index++) rawAt.push(index - 1);
  const prefixes = [...padded.matchAll(SECRET_PREFIX)].map((prefix) => prefix.index);
  for (const at of [...prefixes].reverse()) rawAt.splice(at + 1, 1);
  const normalized = padded
    .replace(SECRET_PREFIX, '$1')
    .replace(/([tTｔＴ][:：])/gi, 't:')
    .replace(/([tTｔＴ][&＆])/gi, 't&')
    .replace(/([:：])/gi, ':')
    .replace(/([&＆])/gi, '&');

  const words: ResourceCommandWords = { secret: hasSecretEditMark(text), sweeps: [], resources: [], buffs: [] };
  const siteOf = (command: string, at: number): ResourceCommandSite => {
    const from = rawAt[at];
    return {
      command,
      from,
      to: rawAt[at + command.length - 1] + 1,
      markFrom: prefixes.includes(from - 1) ? from - 1 : from,
    };
  };

  const round = readTurnChatCommand(text);
  for (const word of normalized.matchAll(/\S+/g)) {
    if (round && rawAt[word.index] === round.from) continue;
    if (parseBuffRemovalCommand(word[0])) {
      words.sweeps.push(siteOf(word[0], word.index));
      continue;
    }
    const chktxt = hideLastingMarks(word[0]);
    if (!/^(t?[:&][^:：&＆])+/i.test(chktxt)) continue;
    const shown = (command: string) => command.replaceAll(LASTING_MARK_HIDDEN, ':');
    for (const res of chktxt.matchAll(/t?:[^:：&＆]+/gi)) {
      words.resources.push(siteOf(shown(res[0]), word.index + res.index));
    }
    for (const buff of chktxt.matchAll(/t?&[^:：&＆]+/gi)) {
      words.buffs.push(siteOf(shown(buff[0]), word.index + buff.index));
    }
  }
  return words;
}

/** What stands in for a buff's `:` mark while a word is cut at its commands, one character for one. */
const LASTING_MARK_HIDDEN = '\u0001';

/** The words a buff's field starts with to tell when its effect moves, `発生:手番終了`, before their `:`. */
const EFFECT_TIMING_WORD = /^(?:発生|tick)$/i;

/**
 * A word, marks made half-width, with each `:` hidden that belongs to the fields of a buff command:
 * one that starts a status, right after the `/` or comma before the status, and one after a field
 * that reads `発生` or `tick` and nothing else, past the buff's name and note, which tells when its
 * effect moves. Any other `:` begins a resource command.
 */
function hideLastingMarks(word: string): string {
  let inBuff = false;
  let fieldFrom = 0;
  let fieldsBefore = 0;
  let hidden = '';
  for (let index = 0; index < word.length; index++) {
    const character = word[index];
    if (character === '&') {
      inBuff = true;
      fieldFrom = index + 1;
      fieldsBefore = 0;
    } else if (character === '/' && inBuff) {
      fieldFrom = index + 1;
      fieldsBefore++;
    } else if (character === ':' && inBuff) {
      const startsStatus = /[/,，、]/.test(word[index - 1] ?? '');
      const timesEffect = fieldsBefore >= 2 && EFFECT_TIMING_WORD.test(word.slice(fieldFrom, index));
      if (startsStatus || timesEffect) {
        hidden += LASTING_MARK_HIDDEN;
        continue;
      }
      inBuff = false;
    }
    hidden += character;
  }
  return hidden;
}

/** Where the parts of one `:` command stand in it, and what they read once full-width marks are made half-width. */
export interface ResourceCommandParts {
  /** The status named, with any slot mark after it, such as `HP` or `HP^`. */
  name: string;
  nameFrom: number;
  /** One of `-`, `+`, `=` and `>`. */
  operator: string;
  operatorAt: number;
  /** Everything after the operator: an amount and its option letters, or a `>` command's text. */
  amount: string;
  amountFrom: number;
}

/**
 * Splits one `:` command into the status it names, its operator and what follows, or answers null
 * when it has no operator after a name. The first full-width `：`, `＋`, `－`, `＝` and `＞` are read as
 * half-width ones.
 */
export function resourceCommandParts(command: string): ResourceCommandParts | null {
  const replaced = ` ${command.replace('：', ':').replace('＋', '+').replace('－', '-').replace('＝', '=').replace('＞', '>')}`;
  const match = /[:]([^-+=>]+)([-+=>])(.*)/.exec(replaced);
  if (!match) return null;
  const nameFrom = match.index;
  const operatorAt = nameFrom + match[1].length;
  return { name: match[1], nameFrom, operator: match[2], operatorAt, amount: match[3], amountFrom: operatorAt + 1 };
}

/**
 * Whether a status can be named in a `:` command: one word holding none of the marks the command is
 * read by, a space, a colon, an ampersand or an operator, which would end the name where they stand.
 */
export function namableInResourceCommand(name: string): boolean {
  return name.length > 0 && !/[\s:：&＆\-+=>－＋＝＞]/.test(name);
}

/** The words that stand for an item's default where the amount of a `:` command goes. */
const DEFAULT_WORDS: readonly string[] = ['既定', '既定値', '規定', '規定値', 'default'];

/**
 * Reads a `:` command that puts values back to their defaults, or answers null for any other.
 *
 * `:*=既定` (`:*=default`) takes every item that keeps a default, and `:HP=既定` the one item named, at
 * the slot written after its name: `:HP^=既定` its maximum, `:HP_MAX_BUFF=既定` the correction on it. The
 * word may be written `既定値`, `規定` or `規定値` as well, which a table says for the same thing. It is
 * read in either width and case, and nothing may follow it. An item named `*` is not
 * reached by the first form; every other operation on it reads as it always did.
 */
export function readDefaultResetCommand(command: string): DefaultPick | null {
  const parts = resourceCommandParts(command);
  if (!parts || parts.operator !== '=') return null;
  if (!DEFAULT_WORDS.includes(parts.amount.trim().normalize('NFKC').toLowerCase())) return null;
  const name = parts.name.trim();
  if (name === '*' || name === '＊') return { kind: 'all' };
  const named = readNamedResourceSlot(parts.name);
  return { kind: 'item', name: named.name, slot: named.slot };
}
