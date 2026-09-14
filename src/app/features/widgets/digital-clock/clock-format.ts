export interface ClockParts {
  readonly hoursMinutes: string;
  readonly seconds: string;
  readonly date: string;
}

export const CLOCK_GHOST_PATTERN = '88:88';

/**
 * Splits a time into what the digital clock shows: `HH:MM`, the seconds, and the date as
 * `YYYY.MM.DD`, all in local time.
 */
export function formatClockParts(date: Date): ClockParts {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return {
    hoursMinutes: `${hours}:${minutes}`,
    seconds,
    date: `${date.getFullYear()}.${month}.${day}`,
  };
}
