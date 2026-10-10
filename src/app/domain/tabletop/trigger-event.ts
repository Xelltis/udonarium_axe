/**
 * What a piece walking onto painted ground sets off.
 *
 * A trap is the plainest of them: ground that takes something from whoever steps on it. The
 * ground remembers nothing about who painted it, only what it does and to whom, so a table
 * can be read for its traps without asking the master anything.
 */
export const TRIGGER_MOMENTS = ['stop', 'enter', 'turnStart', 'turnEnd', 'press'] as const;

/**
 * When the ground goes off.
 *
 * Two of them answer to walking: as a walk ends on the ground, or the moment it is stepped on
 * at all. The next two answer to the round, and go off under whoever is standing there as
 * their turn opens or closes. Ground that burns is ground a piece stands in rather than ground
 * it crosses, and no counting of steps says that. The last answers to nobody walking at all: the
 * ground is a switch, and goes off when somebody presses it.
 */
export type TriggerMoment = (typeof TRIGGER_MOMENTS)[number];

/** Whether ground goes off when it is pressed rather than when anybody walks onto it. */
export function isPressMoment(moment: TriggerMoment): boolean {
  return moment === 'press';
}

/** Whether a moment is one the round brings round rather than one a walk reaches. */
export function isTurnMoment(moment: TriggerMoment): boolean {
  return moment === 'turnStart' || moment === 'turnEnd';
}

/**
 * How often a piece of ground has another go in it.
 *
 * `once` is the whole stretch spent by whoever reaches it first, which is what a collapsing
 * bridge is. A swamp is not: it has as many goes in it as there are pieces to wade in, and a
 * fire burns each of them once a round however many times they step in and out of it.
 */
export const TRIGGER_REPEATS = ['always', 'once', 'oncePerPiece', 'oncePerRound'] as const;

export type TriggerRepeat = (typeof TRIGGER_REPEATS)[number];

export const DEFAULT_TRIGGER_REPEAT: TriggerRepeat = 'always';

/** Reads a stored repeat, falling back to ground with no end of goes in it. */
export function asTriggerRepeat(value: unknown): TriggerRepeat {
  return typeof value === 'string' && (TRIGGER_REPEATS as readonly string[]).includes(value)
    ? (value as TriggerRepeat)
    : DEFAULT_TRIGGER_REPEAT;
}

/**
 * The pieces a stretch of ground has already had, read from and written back as one line.
 *
 * Kept as a line of identifiers rather than a list, since what the table carries between peers
 * is written down as text. Sorted so that two peers that sprang it in different orders write
 * the same line and neither keeps overwriting the other.
 */
export function readSpentBy(held: string): string[] {
  return held.split(' ').filter((one) => one.length > 0);
}

export function writeSpentBy(identifiers: readonly string[]): string {
  return [...new Set(identifiers)].sort().join(' ');
}

export const TRIGGER_TARGETS = ['all', 'pc', 'npc'] as const;

export type TriggerTarget = (typeof TRIGGER_TARGETS)[number];

export const DEFAULT_TRIGGER_MOMENT: TriggerMoment = 'stop';
export const DEFAULT_TRIGGER_TARGET: TriggerTarget = 'all';
export const DEFAULT_TRIGGER_COLOR = '#c0392b';

/** Reads a stored trigger moment, falling back to going off when a walk ends on the ground. */
export function asTriggerMoment(value: unknown): TriggerMoment {
  return typeof value === 'string' && (TRIGGER_MOMENTS as readonly string[]).includes(value)
    ? (value as TriggerMoment)
    : DEFAULT_TRIGGER_MOMENT;
}

/** Reads a stored trigger target, falling back to everyone for anything unknown. */
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
 * What a piece of ground takes from somebody who made the roll it asked for.
 *
 * Nothing said takes nothing, which is the usual shape of getting out of the way of a trap.
 * `half` takes half of what was rolled, rounded down, which is the other usual shape. Anything
 * else is an amount of its own, rolled like any other.
 */
export function triggerPassTake(pass: string, taken: number, roll: () => number = Math.random): number {
  const asked = pass.trim();
  if (asked.length < 1) return 0;
  if (asked.toLowerCase() === HALF) return taken < 0 ? Math.ceil(taken / 2) : Math.floor(taken / 2);
  return rollTriggerAmount(asked, roll);
}

/** The word that halves what was rolled rather than naming an amount of its own. */
export const TRIGGER_PASS_HALF = 'half';
const HALF = TRIGGER_PASS_HALF;

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
