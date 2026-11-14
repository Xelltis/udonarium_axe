/**
 * A count of cells typed into a field, rounded down to a whole one; null for a field left empty or
 * holding no number.
 */
export function wholeCells(value: unknown): number | null {
  if (value === null || value === undefined || `${value}`.trim() === '') return null;
  const cells = Math.floor(Number(value));
  return Number.isFinite(cells) ? cells : null;
}

/** A count of cells typed into a field, taken as none where it is not a whole one above zero. */
export function wholeCellsOrNone(value: unknown): number {
  return Math.max(0, wholeCells(value) ?? 0);
}
