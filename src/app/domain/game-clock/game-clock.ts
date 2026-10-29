/**
 * The time in the story the room keeps: which day it is, and the hour of it, told either as one
 * of the parts a day is split into (morning, noon, evening, night) or on a clock of 24 hours.
 *
 * It is the room's, not a seat's: the game master moves it and everyone sees the same time.
 */

/** How the hour of a day is told: by its parts, or on a clock of 24 hours. */
export type GameClockMode = 'periods' | 'hours';

export interface GameClock {
  /** Which day of the story it is, counted from 1. */
  day: number;
  mode: GameClockMode;
  /** Which part of the day it is, by its place among the parts, while the hour is told by them. */
  period: number;
  /** How far into the day it is, in minutes past midnight, while the hour is told on a clock. */
  minutes: number;
  /** The names of the parts of a day, in order; none for the ones the reader's language has. */
  periods: readonly string[];
  /** How many minutes a step moves the clock, while the hour is told on one. */
  step: number;
  /** How the day is written, with `{n}` for its number; empty for the way the reader's language has. */
  dayFormat: string;
  /** Whether a step the game master takes is said in the chat. */
  announce: boolean;
}

/** The steps the clock may be moved by, in minutes. */
export const GAME_CLOCK_STEPS = [10, 30, 60, 180] as const;

/** As many parts as a day may be split into. */
export const MAX_GAME_CLOCK_PERIODS = 12;

const MINUTES_IN_DAY = 24 * 60;
const MAX_DAY = 99999;
const MAX_NAME_LENGTH = 20;

export const DEFAULT_GAME_CLOCK: GameClock = {
  day: 1,
  mode: 'periods',
  period: 0,
  minutes: 8 * 60,
  periods: [],
  step: 60,
  dayFormat: '',
  announce: true,
};

/**
 * Reads the clock a room holds. Empty text is a room that has not set one, and anything that cannot
 * be read reads the same way; a field out of bounds is brought back inside them.
 */
export function readGameClock(held: unknown): GameClock {
  const text = `${held ?? ''}`;
  if (text.length < 1) return DEFAULT_GAME_CLOCK;
  let source: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_GAME_CLOCK;
    source = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_GAME_CLOCK;
  }
  const periods = Array.isArray(source['periods'])
    ? cleanPeriods(source['periods'].filter((name): name is string => typeof name === 'string'))
    : [];
  const step = Number(source['step']);
  return {
    day: wholeWithin(source['day'], 1, MAX_DAY, DEFAULT_GAME_CLOCK.day),
    mode: source['mode'] === 'hours' ? 'hours' : 'periods',
    period: wholeWithin(source['period'], 0, MAX_GAME_CLOCK_PERIODS - 1, 0),
    minutes: wholeWithin(source['minutes'], 0, MINUTES_IN_DAY - 1, DEFAULT_GAME_CLOCK.minutes),
    periods,
    step: (GAME_CLOCK_STEPS as readonly number[]).includes(step) ? step : DEFAULT_GAME_CLOCK.step,
    dayFormat: typeof source['dayFormat'] === 'string' ? source['dayFormat'].slice(0, MAX_NAME_LENGTH * 2) : '',
    announce: source['announce'] !== false,
  };
}

/** Writes a clock the way {@link readGameClock} reads it. */
export function writeGameClock(clock: GameClock): string {
  return JSON.stringify(clock);
}

/**
 * The names of the parts of a day, from a list written one after another: each trimmed and cut
 * short, the empty ones and the repeats left out, at most {@link MAX_GAME_CLOCK_PERIODS}.
 */
export function cleanPeriods(names: readonly string[]): string[] {
  const kept: string[] = [];
  for (const raw of names) {
    const name = raw.trim().slice(0, MAX_NAME_LENGTH);
    if (name.length > 0 && !kept.includes(name)) kept.push(name);
  }
  return kept.slice(0, MAX_GAME_CLOCK_PERIODS);
}

/** The parts of a day the clock is told by: its own, else the ones given for the reader's language. */
export function periodsOf(clock: GameClock, defaults: readonly string[]): readonly string[] {
  return clock.periods.length > 0 ? clock.periods : defaults;
}

/**
 * The clock a step on or back leaves: the next part of the day, or the clock moved on by its step,
 * going over into the next day past the last, and back into the one before past the first. The
 * first day is as far back as it goes.
 */
export function stepGameClock(clock: GameClock, direction: 1 | -1, periodCount: number): GameClock {
  if (clock.mode === 'hours') {
    const moved = clock.minutes + direction * clock.step;
    const days = Math.floor(moved / MINUTES_IN_DAY);
    const day = clock.day + days;
    if (day < 1) return { ...clock, day: 1, minutes: 0 };
    return { ...clock, day: Math.min(MAX_DAY, day), minutes: moved - days * MINUTES_IN_DAY };
  }
  const count = Math.max(1, periodCount);
  const moved = Math.min(clock.period, count - 1) + direction;
  const days = Math.floor(moved / count);
  const day = clock.day + days;
  if (day < 1) return { ...clock, day: 1, period: 0 };
  return { ...clock, day: Math.min(MAX_DAY, day), period: moved - days * count };
}

/** The clock on another day, the hour of it left as it was. */
export function withDay(clock: GameClock, day: number): GameClock {
  return { ...clock, day: wholeWithin(day, 1, MAX_DAY, clock.day) };
}

/** How the day is written, with `{n}` in the format standing for its number. */
export function formatGameClockDay(clock: GameClock, defaultFormat: string): string {
  const format = clock.dayFormat.includes('{n}') ? clock.dayFormat : defaultFormat;
  return format.replaceAll('{n}', `${clock.day}`);
}

/** How the hour of the day is written: the name of its part, or the time on a clock of 24 hours. */
export function formatGameClockTime(clock: GameClock, periods: readonly string[]): string {
  if (clock.mode === 'hours') {
    const hours = Math.floor(clock.minutes / 60);
    const minutes = clock.minutes % 60;
    return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`;
  }
  return periods[Math.min(clock.period, periods.length - 1)] ?? '';
}

function wholeWithin(value: unknown, low: number, high: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(high, Math.max(low, Math.floor(number)));
}
