/** The value limited to the range from min to max; when min is above max, max wins. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
