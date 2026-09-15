import { BUFF_TIMINGS, BuffTiming } from '@axe/domain/character/buff-timing';

/**
 * One state a room keeps on hand to put on a piece: poisoned, bound, on fire.
 *
 * It is not held on any piece. It says what to write down when somebody ticks it on, and the
 * writing down is an ordinary buff, so the badge over the piece, the buff manager and the
 * counting of rounds all work on it without knowing it came from here.
 */
export interface StatusAilment {
  /**
   * What it is called, which is also how it is asked for as a column.
   *
   * The display items are separated by spaces, so a name with a space in it could never be
   * named as one. A name is a single word here for that reason.
   */
  name: string;
  /** A key from `BUFF_COLORS` or a hex colour. Empty for the usual one. */
  color: string;
  /** The mark on the badge. Empty for the usual one. */
  icon: string;
  /** How long it lasts. Zero waits to be taken away. */
  rounds: number;
  timing: BuffTiming;
  /** A line about what it does, which rides along on the buff. */
  effect: string;
}

const CODE_PREFIX = {
  color: 'color:',
  icon: 'icon:',
  rounds: 'rounds:',
  timing: 'timing:',
  effect: 'effect:',
} as const;

/**
 * When a state ends, where nobody said.
 *
 * Given a number of rounds, it is meant to run out with them; given none, it is meant to be
 * held until somebody clears it.
 */
export function impliedBuffTiming(rounds: number): BuffTiming {
  return rounds > 0 ? 'roundEnd' : 'none';
}

/**
 * Sets how long a state lasts.
 *
 * The moment it ends follows the count while nobody has chosen one: giving a state rounds
 * means it should run out with them, and taking them away means it should be held. A moment
 * somebody picked on purpose is left where they put it.
 */
export function withRounds(ailment: StatusAilment, rounds: number): StatusAilment {
  const next = Number.isFinite(rounds) ? Math.max(0, Math.floor(rounds)) : 0;
  const chosen = ailment.timing !== impliedBuffTiming(ailment.rounds);
  return { ...ailment, rounds: next, timing: chosen ? ailment.timing : impliedBuffTiming(next) };
}

/**
 * A fresh state of that name with nothing else set: no colour or icon, no rounds, and held until
 * cleared.
 */
export function newStatusAilment(name: string): StatusAilment {
  return { name, color: '', icon: '', rounds: 0, timing: 'none', effect: '' };
}

/**
 * Writes one down as a line.
 *
 * Only what differs from what would be assumed is written, so a plain state is its name alone.
 * The effect comes last because it is the only field that may hold spaces.
 */
export function encodeStatusAilment(ailment: StatusAilment): string {
  const name = ailment.name.trim().split(/\s+/)[0] ?? '';
  if (name.length < 1) return '';

  const codes = [name];
  if (ailment.color.trim().length > 0) codes.push(CODE_PREFIX.color + ailment.color.trim());
  if (ailment.icon.trim().length > 0) codes.push(CODE_PREFIX.icon + ailment.icon.trim());
  if (ailment.rounds > 0) codes.push(CODE_PREFIX.rounds + ailment.rounds);
  if (ailment.timing !== impliedBuffTiming(ailment.rounds)) codes.push(CODE_PREFIX.timing + ailment.timing);
  if (ailment.effect.trim().length > 0) codes.push(CODE_PREFIX.effect + ailment.effect.trim());
  return codes.join(' ');
}

/**
 * Reads one back. Null for a line with no name on it.
 *
 * A token it has never heard of is passed over rather than throwing the line away, so a room
 * where somebody runs an older build loses the one field it cannot name, not the whole state.
 */
export function decodeStatusAilment(line: string): StatusAilment | null {
  const tokens = (line ?? '').trim().split(/\s+/);
  const name = tokens.shift() ?? '';
  if (name.length < 1 || name.includes(':')) return null;

  const ailment = newStatusAilment(name);
  let timingSaid = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith(CODE_PREFIX.effect)) {
      // The rest of the line is the effect, spaces and all.
      ailment.effect = [token.slice(CODE_PREFIX.effect.length), ...tokens.slice(i + 1)].join(' ').trim();
      break;
    }
    if (token.startsWith(CODE_PREFIX.color)) {
      ailment.color = token.slice(CODE_PREFIX.color.length);
    } else if (token.startsWith(CODE_PREFIX.icon)) {
      ailment.icon = token.slice(CODE_PREFIX.icon.length);
    } else if (token.startsWith(CODE_PREFIX.rounds)) {
      const rounds = Number(token.slice(CODE_PREFIX.rounds.length));
      if (Number.isFinite(rounds) && rounds >= 0) ailment.rounds = Math.floor(rounds);
    } else if (token.startsWith(CODE_PREFIX.timing)) {
      const timing = token.slice(CODE_PREFIX.timing.length);
      if ((BUFF_TIMINGS as readonly string[]).includes(timing)) {
        ailment.timing = timing as BuffTiming;
        timingSaid = true;
      }
    }
  }
  if (!timingSaid) ailment.timing = impliedBuffTiming(ailment.rounds);
  return ailment;
}

/** The states a room keeps, one to a line. Two of a name would be two of a column, so the first wins. */
export function parseStatusAilments(text: string): StatusAilment[] {
  const ailments: StatusAilment[] = [];
  const taken = new Set<string>();
  for (const line of (text ?? '').split(/\r?\n/)) {
    const ailment = decodeStatusAilment(line);
    if (!ailment || taken.has(ailment.name)) continue;
    taken.add(ailment.name);
    ailments.push(ailment);
  }
  return ailments;
}

/**
 * Writes the states down one to a line, as the catalog stores them. A state with no name is left
 * out.
 */
export function formatStatusAilments(list: readonly StatusAilment[]): string {
  return list
    .map((ailment) => encodeStatusAilment(ailment))
    .filter((line) => line.length > 0)
    .join('\n');
}

/** The state of exactly that name in the list, or null. */
export function findStatusAilment(list: readonly StatusAilment[], name: string): StatusAilment | null {
  return list.find((ailment) => ailment.name === name) ?? null;
}
