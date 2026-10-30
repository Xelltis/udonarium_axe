import { parseBuffRemovalCommand } from '@axe/domain/character/buff-bulk-removal';
import { withInlineStampsAsSpaces } from '@axe/domain/chat/inline-stamp';

/** One command picked out of a chat line, in the form it is carried out in, and where it was typed. */
export interface ResourceCommandSite {
  command: string;
  from: number;
  to: number;
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
 * The `s` that makes a command secret: before a resource command in either case, and before a buff
 * in lower case alone, so that words such as `S&W` stay words.
 */
const SECRET_MARK = /\s(?:[sSｓＳ][tTｔＴ]?[:：]|[sｓ][tTｔＴ]?[&＆])/;
const SECRET_PREFIX = /(\s)(?:[sSｓＳ](?=[tTｔＴ]?[:：])|[sｓ](?=[tTｔＴ]?[&＆]))/g;

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
 * word that starts any other way holds no command. A stamp put inside the line ends a word as a
 * space does, so one put right after a command is never read as part of it.
 */
export function resourceCommandSites(text: string): ResourceCommandWords {
  const padded = ` ${withInlineStampsAsSpaces(text)}`;
  const rawAt: number[] = [];
  for (let index = 0; index < padded.length; index++) rawAt.push(index - 1);
  for (const prefix of [...padded.matchAll(SECRET_PREFIX)].reverse()) rawAt.splice(prefix.index + 1, 1);
  const normalized = padded
    .replace(SECRET_PREFIX, '$1')
    .replace(/([tTｔＴ][:：])/gi, 't:')
    .replace(/([tTｔＴ][&＆])/gi, 't&')
    .replace(/([:：])/gi, ':')
    .replace(/([&＆])/gi, '&');

  const words: ResourceCommandWords = { secret: hasSecretEditMark(text), sweeps: [], resources: [], buffs: [] };
  const siteOf = (command: string, at: number): ResourceCommandSite => ({
    command,
    from: rawAt[at],
    to: rawAt[at + command.length - 1] + 1,
  });

  for (const word of normalized.matchAll(/\S+/g)) {
    const chktxt = word[0];
    if (parseBuffRemovalCommand(chktxt)) {
      words.sweeps.push(siteOf(chktxt, word.index));
      continue;
    }
    if (!/^(t?[:&][^:：&＆])+/i.test(chktxt)) continue;
    for (const res of chktxt.matchAll(/t?:[^:：&＆]+/gi)) words.resources.push(siteOf(res[0], word.index + res.index));
    for (const buff of chktxt.matchAll(/t?&[^:：&＆]+/gi)) words.buffs.push(siteOf(buff[0], word.index + buff.index));
  }
  return words;
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
