/**
 * What a piece walking onto painted ground sets off.
 *
 * A trap is the plainest of them: ground that takes something from whoever steps on it. The
 * ground remembers nothing about who painted it, only what it does and to whom, so a table
 * can be read for its traps without asking the master anything.
 */
export const TRIGGER_MOMENTS = ['stop', 'enter'] as const;

/** When the ground goes off: as a walk ends on it, or the moment it is stepped on at all. */
export type TriggerMoment = (typeof TRIGGER_MOMENTS)[number];

export const TRIGGER_TARGETS = ['all', 'pc', 'npc'] as const;

export type TriggerTarget = (typeof TRIGGER_TARGETS)[number];

export const DEFAULT_TRIGGER_MOMENT: TriggerMoment = 'stop';
export const DEFAULT_TRIGGER_TARGET: TriggerTarget = 'all';
export const DEFAULT_TRIGGER_COLOR = '#c0392b';

export function asTriggerMoment(value: unknown): TriggerMoment {
  return typeof value === 'string' && (TRIGGER_MOMENTS as readonly string[]).includes(value)
    ? (value as TriggerMoment)
    : DEFAULT_TRIGGER_MOMENT;
}

export function asTriggerTarget(value: unknown): TriggerTarget {
  return typeof value === 'string' && (TRIGGER_TARGETS as readonly string[]).includes(value)
    ? (value as TriggerTarget)
    : DEFAULT_TRIGGER_TARGET;
}

/** Whether this ground has anything to say to this piece. */
export function triggerCatches(target: TriggerTarget, isNpc: boolean): boolean {
  if (target === 'all') return true;
  return target === 'npc' ? isNpc : !isNpc;
}

const DICE = /^\s*(\d*)\s*[dD]\s*(\d+)\s*$/;
const WHOLE = /^\s*[-+]?\d+\s*$/;

/**
 * What the ground takes, which may be a number or a handful of dice.
 *
 * `2d6`, `1d6+2`, `-3` and `4` are all answers. Anything else is nothing at all: a trap that
 * cannot say how much it takes takes nothing, rather than guessing at a number nobody wrote.
 */
export function rollTriggerAmount(amount: string, roll: () => number = Math.random): number {
  let total = 0;
  let read = false;
  for (const part of splitTerms(amount)) {
    const sign = part.sign;
    const dice = DICE.exec(part.term);
    if (dice) {
      const count = dice[1] === '' ? 1 : Number(dice[1]);
      const faces = Number(dice[2]);
      if (count < 1 || count > 999 || faces < 1 || faces > 1000) return 0;
      for (let die = 0; die < count; die++) total += sign * (Math.floor(roll() * faces) + 1);
      read = true;
      continue;
    }
    if (!WHOLE.test(part.term)) return 0;
    total += sign * Math.abs(Number(part.term.trim()));
    read = true;
  }
  return read ? total : 0;
}

/** The terms of a sum, each with the sign it was written with. */
function splitTerms(amount: string): { sign: number; term: string }[] {
  const terms: { sign: number; term: string }[] = [];
  let sign = 1;
  let held = '';
  for (const letter of amount ?? '') {
    if (letter === '+' || letter === '-') {
      if (held.trim().length > 0) {
        terms.push({ sign, term: held });
        sign = letter === '-' ? -1 : 1;
        held = '';
        continue;
      }
      // Nothing worth reading has come yet, so this is the sign of what is about to. Space
      // before it is still nothing: ' -3' takes three, the way '-3' does.
      if (terms.length === 0) sign = letter === '-' ? -sign : sign;
      continue;
    }
    held += letter;
  }
  if (held.trim().length > 0) terms.push({ sign, term: held });
  return terms;
}
