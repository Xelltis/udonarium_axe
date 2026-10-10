/** The bounds a value is held within, as the row's settings write them; empty for none. */
export interface StepBounds {
  min: string;
  max: string;
}

function bound(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * A value moved one step up or down from a ± button, and held within its bounds.
 *
 * An empty value counts as nothing, so the first step from it is the step itself. Text that is not
 * a number is not stepped, and null comes back for it.
 */
export function stepValue(value: number | string, delta: number, bounds: StepBounds): number | null {
  const current = value === '' || value == null ? 0 : Number(value);
  if (!Number.isFinite(current)) return null;
  let next = current + delta;
  const min = bound(bounds.min);
  const max = bound(bounds.max);
  if (min !== null) next = Math.max(min, next);
  if (max !== null) next = Math.min(max, next);
  return next;
}

/** Whether a step would change the value at all, so a ± against its bound can be greyed out. */
export function canStep(value: number | string, delta: number, bounds: StepBounds): boolean {
  const next = stepValue(value, delta, bounds);
  if (next === null) return false;
  const current = value === '' || value == null ? 0 : Number(value);
  return next !== current;
}

/**
 * The keyboard a number box asks a phone for.
 *
 * A value that never goes below zero gets the number pad. Anything that may be negative keeps the
 * ordinary keyboard, since the number pad of an iPhone has no minus key.
 */
export function numericInputMode(min: string): 'decimal' | null {
  const floor = bound(min);
  return floor !== null && floor >= 0 ? 'decimal' : null;
}
