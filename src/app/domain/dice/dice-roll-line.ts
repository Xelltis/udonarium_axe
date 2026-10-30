import { toHalfWidth } from '@axe/core/util/string-util';
import { withInlineStampsAsSpaces } from '@axe/domain/chat/inline-stamp';
import { isDicelessArithmetic } from '@axe/domain/data/embedded-roll';

/**
 * A chat line read the way the dice bot reads it before rolling: a leading count of repeats, and the
 * rest of the first line, which is what the game system is asked to roll.
 */
export interface RollLine {
  /** How many times the command is rolled; 1 when no count leads the line. */
  repeat: number;
  /** What the game system is handed, with the count and the space after it taken off. */
  rollText: string;
  /** Where {@link rollText} starts in the line. */
  rollFrom: number;
}

/**
 * A line as the dice bot reads it: in half-width, with each stamp put inside it written as spaces
 * as long, so that one put right after a command ends the command as a space would.
 */
export function rollableText(text: string): string {
  return toHalfWidth(withInlineStampsAsSpaces(text));
}

/**
 * Splits a line, already {@link rollableText rollable}, into its repeat count and the command after it.
 *
 * A count is digits followed by spaces at the very start; a line that starts with a space has a
 * count of one. Only the first line of what follows is handed on. When nothing follows the count,
 * the whole text is handed on instead.
 */
export function readRollLine(text: string): RollLine {
  const match = /^((\d+)?\s+)?(.*)?/.exec(text)!;
  const repeat = match[2] != null ? Number(match[2]) : 1;
  if (match[3] == null) return { repeat, rollText: text, rollFrom: 0 };
  return { repeat, rollText: match[3], rollFrom: match[1]?.length ?? 0 };
}

/**
 * Where the word a line rolls stands: the first after any repeat count, read as the dice bot reads
 * the line, with a space inside a reference's braces counted as part of it, as the word is once the
 * reference is filled in.
 */
export function rollWordSite(text: string): { from: number; to: number } {
  const rollable = rollableText(text);
  const from = readRollLine(rollable).rollFrom;
  let depth = 0;
  for (let index = from; index < rollable.length; index++) {
    const character = rollable[index];
    if (character === '{') depth++;
    else if (character === '}' && depth > 0) depth--;
    else if (depth === 0 && /\s/.test(character)) return { from, to: index };
  }
  return { from, to: rollable.length };
}

/**
 * Whether text may be a dice command where there is no game system to ask: its first word holds a
 * digit or one of `<>=[(`, and is not a resource or buff change, which begins with `:` or `&` after
 * an optional `s` or `t`.
 */
export function looksLikeDiceCommand(text: string): boolean {
  const firstWord = /^\S*/.exec(text)?.[0] ?? '';
  if (/^[sｓＳ]?[tｔＴ]?[:：&＆]/i.test(firstWord)) return false;
  return /[\d<>=[(]/.test(firstWord);
}

/**
 * Whether a word is shaped like a roll in any game system: printable ASCII only, starting with a
 * digit or bracket, or with a few letters followed by a digit, a comparison, a bracket, an operator
 * or one of `@#$`. `2d6+3`, `CC<=50` and `K20@9` are; `1日目`, `hello` and `{HP}` are not.
 */
export function looksLikeRollWord(word: string): boolean {
  return /^[\x21-\x7E]+$/.test(word) && /^(?:[0-9([]|[A-Za-z]{1,8}[0-9<>=([+\-*/@#$])/.test(word);
}

/** How many dice one roll may throw in all before it is not tried while being typed: the dice library gives up past this. */
const MOST_DICE_TRIED = 10_000;
/** The most dice one term may throw, past which the dice library rolls nothing and answers 0. */
const MOST_DICE_IN_A_TERM = 200;
/** The most sides a die may have, past which the dice library rolls nothing and answers 0. */
const MOST_SIDES = 10_000;
/** The most times a roll may be repeated. */
const MOST_REPEATS = 100;

/** What a game system makes of a line, so far as the chat input can tell before it is sent. */
export type RollCheck =
  /** It is a roll, and this is what one came out as. */
  | { kind: 'rolled'; result: string }
  /** It is no roll and was not meant as one: it goes out as chat. */
  | { kind: 'notRoll' }
  /** It is shaped like a roll, but this system takes no such command, so it goes out as chat. */
  | { kind: 'plainText' }
  /** The system takes it for a command, but cannot roll it, so it goes out unanswered. */
  | { kind: 'unrollable' }
  /** The system broke off rolling it, so it goes out unanswered. */
  | { kind: 'failed' }
  /** It throws more dice than the system rolls, so it goes out unanswered; it is not tried. */
  | { kind: 'tooMany' }
  /** A count of nothing leads it, so it is not rolled. */
  | { kind: 'noRepeat' }
  /** The system's code could not be fetched, so there is no telling. */
  | { kind: 'cannotCheck' };

/** What of a game system a line is checked against. */
export interface RollCheckSystem {
  readonly COMMAND_PATTERN: RegExp | null;
  eval(command: string): { text: string } | null;
}

/** A term past what the dice library rolls: too many dice, too many sides, or too many repeats. */
export interface RollLimitBreach {
  limit: 'dice' | 'sides' | 'repeats';
  from: number;
  to: number;
}

/** The first word of a command, which is all the dice library reads; the rest is a comment. */
export function firstWordOf(text: string): string {
  return /^\S*/.exec(text)?.[0] ?? '';
}

/** How many dice a command throws, as near as its terms tell, before any repeat. */
function diceThrownBy(command: string): number {
  let total = 0;
  for (const term of command.matchAll(/(\d*)[dDbBrRuU](\d+)/g)) total += term[1] ? Number(term[1]) : 1;
  return total;
}

/**
 * What tells a word that is shaped like a roll was meant as one: dice thrown, as `2d6` or `2B6`, or a
 * target compared to, as `<=50`. Words such as `10:30`, `1st`, `100%` or `A4` are chat.
 */
const ROLL_INTENT = /\d*[dD]\d|\d[bBrRuU]\d|[<>=]/;

/**
 * Whether a word is shaped like a roll and was meant as one: it throws dice or compares against a
 * target, and is no number alone, no plain sum and no word such as `10:30`.
 */
export function meantAsRollWord(word: string): boolean {
  return looksLikeRollWord(word) && !/^\d+$/.test(word) && !isDicelessArithmetic(word) && ROLL_INTENT.test(word);
}

/**
 * Checks a line as the dice bot would roll it when sent: in half-width, with its repeat count taken
 * off, tested against the system's command pattern, and then rolled. A roll that would throw more
 * dice than the system can is not tried, as the system would only give up on it. Words that throw
 * dice or compare against a target, which the system turns down or cannot roll, are told apart from
 * chat, which digits alone, plain sums, words past ASCII and words such as `10:30` are taken for.
 */
export function checkRollLine(system: RollCheckSystem, unreachable: boolean, text: string): RollCheck {
  const line = readRollLine(rollableText(text));
  const rollText = line.rollText;
  if (unreachable) return looksLikeDiceCommand(rollText) ? { kind: 'cannotCheck' } : { kind: 'notRoll' };
  const word = firstWordOf(rollText);
  const meantAsRoll = meantAsRollWord(word);
  if (system.COMMAND_PATTERN && !system.COMMAND_PATTERN.test(rollText)) {
    return meantAsRoll ? { kind: 'plainText' } : { kind: 'notRoll' };
  }
  if (!rollText) return { kind: 'notRoll' };
  if (line.repeat < 1) return { kind: 'noRepeat' };
  const repeatWord = /^(?:repeat|rep|x)(\d+)$/i.exec(word);
  const thrown = repeatWord
    ? diceThrownBy(firstWordOf(rollText.slice(word.length).trimStart())) * Number(repeatWord[1])
    : diceThrownBy(word);
  if (thrown * line.repeat > MOST_DICE_TRIED) return { kind: 'tooMany' };
  try {
    const result = system.eval(line.repeat > 1 ? `x${line.repeat} ${rollText}` : rollText);
    if (result?.text) return { kind: 'rolled', result: result.text };
  } catch {
    return { kind: 'failed' };
  }
  return meantAsRoll ? { kind: 'unrollable' } : { kind: 'notRoll' };
}

/**
 * The terms of a roll's first word that ask for more than the dice library rolls, and a repeat
 * count past what it repeats: each answers 0, or the roll is turned down, rather than rolled.
 */
export function rollLimitBreaches(text: string): RollLimitBreach[] {
  const half = rollableText(text);
  const line = readRollLine(half);
  const breaches: RollLimitBreach[] = [];
  if (line.rollFrom > 0 && line.repeat > MOST_REPEATS) {
    breaches.push({ limit: 'repeats', from: 0, to: half.search(/\s/) });
  }
  const word = firstWordOf(line.rollText);
  const repeat = /^(?:repeat|rep|x)(\d+)$/i.exec(word);
  if (repeat && Number(repeat[1]) > MOST_REPEATS) {
    breaches.push({ limit: 'repeats', from: line.rollFrom, to: line.rollFrom + word.length });
  }
  for (const term of word.matchAll(/(\d*)[dD](\d+)/g)) {
    const from = line.rollFrom + term.index;
    const to = from + term[0].length;
    if (term[1] && Number(term[1]) > MOST_DICE_IN_A_TERM) breaches.push({ limit: 'dice', from, to });
    else if (Number(term[2]) > MOST_SIDES) breaches.push({ limit: 'sides', from, to });
  }
  return breaches;
}

/** How many examples of a system's commands are offered. */
const MOST_EXAMPLES = 12;

/**
 * Commands a game system's help is written with that the system rolls as they stand, in the order
 * the help gives them: words of ASCII the command pattern takes and a roll answers. They stand as
 * examples to pick from without reading the help.
 */
export function diceCommandExamples(system: RollCheckSystem & { readonly HELP_MESSAGE: string }): string[] {
  const examples: string[] = [];
  for (const word of new Set(system.HELP_MESSAGE.split(/[\s、。：:（）()「」『』・,]+/))) {
    if (examples.length >= MOST_EXAMPLES) break;
    if (!/^[\x21-\x7E]{2,24}$/.test(word) || !system.COMMAND_PATTERN?.test(word)) continue;
    try {
      if (system.eval(word)) examples.push(word);
    } catch {
      continue;
    }
  }
  return examples;
}
