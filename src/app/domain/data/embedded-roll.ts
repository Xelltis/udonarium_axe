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
  return isPlainArithmetic(expression) && !/\d\s*[dD]/.test(expression) && /\d/.test(expression);
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
