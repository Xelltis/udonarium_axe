/** A number field's value as is, or the fallback when the field is empty or not a number. */
export function floatOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * A number field's value rounded to a whole number, or the fallback when the field is empty or not
 * a number.
 */
export function roundOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.round(value) : fallback;
}
