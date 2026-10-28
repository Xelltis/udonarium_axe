import { parseBuffRemovalCommand } from '@axe/domain/character/buff-bulk-removal';

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

const SECRET_MARK = /(\s[sSｓＳ][tTｔＴ]?[:：&＆])/i;
const SECRET_TARGETED_EDIT = /(\s[sSｓＳ][tTｔＴ][:：])/i;
const SECRET_EDIT = /(\s[sSｓＳ][:：])/i;

/**
 * Picks the resource, buff and sweep commands out of a chat line, with where each stands in it.
 *
 * Full-width marks are read as half-width ones, and an `s` in front of the first `:` or `t:` is
 * taken off, the rest of the word then read as any other. Each word is a sweep, or else, when it
 * starts with `:`, `&`, `t:` or `t&`, splits into the commands each mark begins. A word that starts
 * any other way, an `s&` among them, holds no command.
 */
export function resourceCommandSites(text: string): ResourceCommandWords {
  const padded = ` ${text}`;
  const rawAt = Array.from({ length: padded.length }, (_, index) => index - 1);

  const targetedAt = padded.search(SECRET_TARGETED_EDIT);
  const text2 = padded.replace(SECRET_TARGETED_EDIT, ' t:');
  if (targetedAt >= 0) rawAt.splice(targetedAt + 1, 1);
  const plainAt = text2.search(SECRET_EDIT);
  const text3 = text2.replace(SECRET_EDIT, ' :');
  if (plainAt >= 0) rawAt.splice(plainAt + 1, 1);
  const normalized = text3
    .replace(/([tTｔＴ][:：])/gi, 't:')
    .replace(/([tTｔＴ][&＆])/gi, 't&')
    .replace(/([:：])/gi, ':')
    .replace(/([&＆])/gi, '&');

  const words: ResourceCommandWords = { secret: SECRET_MARK.test(padded), sweeps: [], resources: [], buffs: [] };
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
