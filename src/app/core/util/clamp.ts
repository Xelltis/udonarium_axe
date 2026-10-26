/** The value limited to the range from min to max; when min is above max, max wins. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The value held between 0 and 1, reading anything that is not a finite number as 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

/** The value limited to the range from min to max, or the fallback for anything that is not a finite number. */
export function clampOr(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}
