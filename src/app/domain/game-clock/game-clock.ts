import { toGraphemes } from '@axe/core/util/graphemes';

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
/** As long as the way the day is written may be. */
const MAX_DAY_FORMAT_LENGTH = MAX_NAME_LENGTH * 2;

/** Text cut to so many letters as a reader sees them, so that no letter written in two is split. */
function cutShort(text: string, letters: number): string {
  return text.length <= letters ? text : toGraphemes(text).slice(0, letters).join('');
}

/** How the day is written, trimmed and cut as the clock keeps it. */
export function cleanDayFormat(format: string): string {
  return cutShort(format.trim(), MAX_DAY_FORMAT_LENGTH);
}

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
    dayFormat: typeof source['dayFormat'] === 'string' ? cleanDayFormat(source['dayFormat']) : '',
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
    const name = cutShort(raw.trim(), MAX_NAME_LENGTH);
    if (name.length > 0 && !kept.includes(name)) kept.push(name);
  }
  return kept.slice(0, MAX_GAME_CLOCK_PERIODS);
}

/**
 * Which of so many parts of the day the clock stands in: the one it keeps, or the last there is
 * where it keeps one past those there are now, as after its names were cut back.
 */
export function periodIndexOf(clock: GameClock, periodCount: number): number {
  return Math.max(0, Math.min(clock.period, periodCount - 1));
}

/** The parts of a day the clock is told by: its own, else the ones given for the reader's language. */
export function periodsOf(clock: GameClock, defaults: readonly string[]): readonly string[] {
  return clock.periods.length > 0 ? clock.periods : defaults;
}

/**
 * The clock a step on or back leaves: the next part of the day, or the clock moved on by its step,
 * going over into the next day past the last, and back into the one before past the first. The
 * start of the first day is as far back as it goes, and the end of the last as far on.
 */
export function stepGameClock(clock: GameClock, direction: 1 | -1, periodCount: number): GameClock {
  if (clock.mode === 'hours') {
    const moved = clock.minutes + direction * clock.step;
    const days = Math.floor(moved / MINUTES_IN_DAY);
    const day = clock.day + days;
    if (day < 1) return { ...clock, day: 1, minutes: 0 };
    if (day > MAX_DAY) return { ...clock, day: MAX_DAY, minutes: MINUTES_IN_DAY - 1 };
    return { ...clock, day, minutes: moved - days * MINUTES_IN_DAY };
  }
  const count = Math.max(1, periodCount);
  const moved = periodIndexOf(clock, count) + direction;
  const days = Math.floor(moved / count);
  const day = clock.day + days;
  if (day < 1) return { ...clock, day: 1, period: 0 };
  if (day > MAX_DAY) return { ...clock, day: MAX_DAY, period: count - 1 };
  return { ...clock, day, period: moved - days * count };
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
  return periods[periodIndexOf(clock, periods.length)] ?? '';
}

function wholeWithin(value: unknown, low: number, high: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(high, Math.max(low, Math.floor(number)));
}

/**
 * The hour of the day the sky of each part of the day is drawn at, by the part's place among them:
 * null, or nothing at its place, for a part laid evenly over the day as the parts are by default.
 *
 * Kept apart from the clock, so that a version that knows nothing of it, writing the clock as the
 * game master steps it, leaves it as it was.
 */
export type PeriodSkies = readonly (number | null)[];

/** The hours a part of the day may be drawn at, every three from dawn round to the small hours. */
export const GAME_CLOCK_SKY_HOURS = [6, 9, 12, 15, 18, 21, 0, 3] as const;

/**
 * Reads the skies a room holds for its parts of the day. Empty text is a room that has chosen none,
 * and anything that cannot be read reads the same way; a place holding no whole hour of the day
 * reads as laid evenly.
 */
export function readPeriodSkies(held: unknown): PeriodSkies {
  const text = `${held ?? ''}`;
  if (text.length < 1) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .slice(0, MAX_GAME_CLOCK_PERIODS)
    .map((hour) => (Number.isInteger(hour) && hour >= 0 && hour < 24 ? (hour as number) : null));
}

/** Writes skies the way {@link readPeriodSkies} reads them, empty where every part is laid evenly. */
export function writePeriodSkies(skies: PeriodSkies): string {
  const kept = [...skies];
  while (kept.length > 0 && kept[kept.length - 1] === null) kept.pop();
  return kept.length > 0 ? JSON.stringify(kept) : '';
}

/** The skies with the part at one place drawn at an hour, or laid evenly again for null. */
export function withPeriodSky(skies: PeriodSkies, index: number, hour: number | null): PeriodSkies {
  const next = Array.from({ length: Math.max(skies.length, index + 1) }, (_, at) => skies[at] ?? null);
  next[index] = hour;
  return next;
}

/**
 * The skies carried over to parts of the day named anew: each part keeps the sky of the part of the
 * same name, and, where there are as many parts as before, one renamed where it stands keeps the
 * sky of the part that stood there.
 */
export function carryPeriodSkies(skies: PeriodSkies, before: readonly string[], after: readonly string[]): PeriodSkies {
  return after.map((name, index) => {
    const was = before.indexOf(name);
    if (was >= 0) return skies[was] ?? null;
    return before.length === after.length ? (skies[index] ?? null) : null;
  });
}

/**
 * Where a part of the day falls when the parts are laid evenly over the day from dawn on, as
 * morning, noon, evening and night are.
 */
export function evenDayFractionOf(index: number, periodCount: number): number {
  return (0.25 + index / Math.max(1, periodCount)) % 1;
}

/**
 * How far through the day the clock stands, from 0 at midnight to just short of 1: the time on a
 * clock of 24 hours, or, told by parts of the day, the hour the part's sky is drawn at where one is
 * chosen, else the start of the part, the parts laid evenly over the day from dawn on.
 */
export function dayFractionOf(clock: GameClock, periodCount: number, skies: PeriodSkies = []): number {
  if (clock.mode === 'hours') return clock.minutes / MINUTES_IN_DAY;
  const count = Math.max(1, periodCount);
  const index = periodIndexOf(clock, count);
  const hour = skies[index] ?? null;
  return hour === null ? evenDayFractionOf(index, count) : hour / 24;
}
