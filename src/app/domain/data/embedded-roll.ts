export interface EmbeddedRollSite {
  command: string;
  start: number;
  end: number;
}

/**
 * `[...]` marks a run of a resource edit that only stands on its own — a system command such as
 * Sword World's `k10`, which bcdice answers alone but cannot take as a term of the arithmetic
 * around it. Nested brackets belong to the command, so only the outermost pair opens a site.
 */
export function findEmbeddedRolls(expression: string): EmbeddedRollSite[] {
  const sites: EmbeddedRollSite[] = [];
  let depth = 0;
  let start = -1;

  for (let index = 0; index < expression.length; index++) {
    const char = expression[index];
    if (char === '[') {
      if (depth === 0) start = index;
      depth++;
      continue;
    }
    if (char !== ']' || depth === 0) continue;
    depth--;
    if (depth > 0) continue;
    const command = expression.slice(start + 1, index);
    if (command.length > 0) sites.push({ command, start, end: index + 1 });
  }

  return sites;
}

/** Puts each answer back where its command stood, in parentheses when it is negative. */
export function replaceEmbeddedRolls(expression: string, answers: readonly number[]): string {
  const sites = findEmbeddedRolls(expression);
  let replaced = '';
  let cursor = 0;

  sites.forEach((site, index) => {
    const answer = answers[index];
    if (answer == null) return;
    replaced += expression.slice(cursor, site.start) + (answer < 0 ? `(${answer})` : `${answer}`);
    cursor = site.end;
  });

  return replaced + expression.slice(cursor);
}

/** The expression with each bracketed command left standing in place of its brackets. */
export function unwrapEmbeddedRolls(expression: string): string {
  const sites = findEmbeddedRolls(expression);
  let unwrapped = '';
  let cursor = 0;
  for (const site of sites) {
    unwrapped += expression.slice(cursor, site.start) + site.command;
    cursor = site.end;
  }
  return unwrapped + expression.slice(cursor);
}

/**
 * A division's rounding, written after its divisor as bcdice reads it: `C` or `U` rounds up, `R`
 * rounds half away from nought and `F` rounds down.
 */
const DIVISION_ROUNDING = /(\/\s*(?:\d+|\([^()]*\)))\s*[CRFU]/gi;

/**
 * Whether an amount is plain arithmetic once its bracketed commands are answered: numbers, dice,
 * the operators between them and the rounding of a division. Anything else - a letter a system
 * command takes after its total, a reference left unfilled - leaves arithmetic that cannot be
 * worked out on its own.
 */
export function isPlainArithmetic(expression: string): boolean {
  const answered = replaceEmbeddedRolls(
    expression,
    findEmbeddedRolls(expression).map(() => 0)
  );
  return /^[\d\s+\-*/().dD]*$/.test(answered.replace(DIVISION_ROUNDING, '$1'));
}

/**
 * Whether a bracketed command is arithmetic with no dice in it, which bcdice answers only as a
 * calculation, `C(...)`, and not as a roll on its own.
 */
export function isDicelessArithmetic(expression: string): boolean {
  return isPlainArithmetic(expression) && !/[dD]/.test(expression) && /\d/.test(expression);
}

/** One term of plain arithmetic at the very end of a command: `+3`, `-0` or `-(2+1)`. */
const TRAILING_TERM = /(\s*[+-]\s*(?:\d+|\((?:[\d\s+*/-]|\([\d\s+*/-]*\))*\)))\s*$/;

/**
 * The ways plain arithmetic can be split off the end of a command, the shortest first: `+3`, then
 * `+5+3`, while what stays before it is something more than arithmetic. A system command may take
 * nothing after the letters it reads last, such as a modifier to the dice, so arithmetic written
 * after them can be worked out apart and added on; the shortest split that leaves a command the
 * system reads is the one meant.
 */
export function trailingArithmeticSplits(command: string): { head: string; tail: string }[] {
  const splits: { head: string; tail: string }[] = [];
  let rest = command;
  let tail = '';
  for (let match = TRAILING_TERM.exec(rest); match; match = TRAILING_TERM.exec(rest)) {
    tail = match[1].replace(/\s+/g, '') + tail;
    rest = rest.slice(0, match.index).trim();
    if (rest === '' || isPlainArithmetic(rest)) break;
    splits.push({ head: rest, tail });
  }
  return splits;
}

/** The expression without one pair of parentheses round the whole of it, where it has them. */
export function unwrapParentheses(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return trimmed;
  let depth = 0;
  for (let index = 0; index < trimmed.length; index++) {
    if (trimmed[index] === '(') depth++;
    else if (trimmed[index] === ')') depth--;
    if (depth === 0 && index < trimmed.length - 1) return trimmed;
  }
  return trimmed.slice(1, -1);
}
