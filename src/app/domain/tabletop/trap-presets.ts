import { TriggerMoment, TriggerRepeat } from '@axe/domain/tabletop/trigger-event';

/**
 * The traps a generated dungeon is strewn with.
 *
 * A trap is nothing the table does not already have: it is ground that goes off, painted
 * where nobody can see it and told to give itself away once it has. Named here so that a
 * generator has something to strew, and so that what a pit does is written down in one place
 * rather than built by hand in the middle of a build.
 *
 * The numbers are a starting point, not any one game's rules. Everything a trap lays down is
 * an ordinary piece of painted ground, which the master may open and edit once it is there.
 */
export const TRAP_KINDS = ['pit', 'dart', 'blade', 'alarm', 'rune'] as const;

export type TrapKind = (typeof TRAP_KINDS)[number];

export const DEFAULT_TRAP_KIND: TrapKind = 'pit';

export interface TrapPreset {
  /** What it takes from whoever it catches. Empty takes nothing, which an alarm does not. */
  amount: string;
  /** When it goes off: the moment it is stepped on, or as a walk ends on it. */
  moment: TriggerMoment;
  /** How many goes it has in it. */
  repeat: TriggerRepeat;
  /** The state it leaves a piece in, by the name the room keeps it under. Empty leaves none. */
  ailment: string;
  /** Whether what it says reaches the master alone, which is the whole of what a trip wire does. */
  silent: boolean;
  /** Whether going off is what shows it to the room. */
  reveals: boolean;
  /** Whether it asks whoever walked in for a roll to get out of it. */
  asksRoll: boolean;
  /** The colour the ground is drawn in on the table. */
  color: string;
}

/** What each kind of trap comes to. Adding one is a line here and a word in each language. */
export const TRAP_PRESETS: Record<TrapKind, TrapPreset> = {
  // A pit that has been fallen into is a hole in the floor: it is sprung once and then it is
  // simply there, which is why it both spends itself and shows itself.
  pit: {
    amount: '2d6',
    moment: 'enter',
    repeat: 'once',
    ailment: '',
    silent: false,
    reveals: true,
    asksRoll: true,
    color: '#8b6f47',
  },
  dart: {
    amount: '1d6',
    moment: 'enter',
    repeat: 'oncePerPiece',
    ailment: '毒',
    silent: false,
    reveals: true,
    asksRoll: true,
    color: '#6f8f4a',
  },
  // Blades in the wall keep swinging, so this one is the only trap with no end to it.
  blade: {
    amount: '2d6',
    moment: 'enter',
    repeat: 'always',
    ailment: '',
    silent: false,
    reveals: true,
    asksRoll: true,
    color: '#9aa3ab',
  },
  // Nothing happens to whoever crosses it, and that is the point: the master is told and the
  // party is not, and the wire is as unnoticed afterwards as it was before.
  alarm: {
    amount: '',
    moment: 'enter',
    repeat: 'once',
    ailment: '',
    silent: true,
    reveals: false,
    asksRoll: false,
    color: '#c9a227',
  },
  rune: {
    amount: '3d6',
    moment: 'stop',
    repeat: 'once',
    ailment: '',
    silent: false,
    reveals: true,
    asksRoll: true,
    color: '#a64ca6',
  },
};

/** What one kind comes to, reading a kind it has never heard of as a pit. */
export function trapPresetOf(kind: unknown): TrapPreset {
  return TRAP_PRESETS[asTrapKind(kind)];
}

/** Reads a stored kind of trap, falling back to a pit for anything unknown. */
export function asTrapKind(value: unknown): TrapKind {
  return typeof value === 'string' && (TRAP_KINDS as readonly string[]).includes(value)
    ? (value as TrapKind)
    : DEFAULT_TRAP_KIND;
}
