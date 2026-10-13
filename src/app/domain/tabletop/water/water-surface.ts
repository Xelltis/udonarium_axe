/** How high water stands over its own floor when nobody has said, in cells: about knee deep. */
export const DEFAULT_SURFACE_CELLS = 0.5;

/** The highest a surface may stand over its floor, in cells. */
export const MAX_SURFACE_CELLS = 10;

/**
 * How many cells water stands over its floor, read from what was stored.
 *
 * An empty or unreadable value reads as the default rather than as nought. An area laid by a
 * peer that knows nothing of the height arrives with no value at all, and read as nought every
 * pond it laid would drain to a wet floor.
 */
export function surfaceCellsOf(value: unknown): number {
  if (value === '' || value === null || value === undefined) return DEFAULT_SURFACE_CELLS;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SURFACE_CELLS;
  return Math.min(Math.max(numeric, 0), MAX_SURFACE_CELLS);
}

/** How murky water is when nobody has said, from 0 for clear to 1 for mud: a little, as most water is. */
export const DEFAULT_TURBIDITY = 0.15;

/**
 * How murky water is, from 0 for clear to 1 for water nothing can be seen through, read from what
 * was stored. An empty or unreadable value reads as the default, for the same reason the height does.
 */
export function turbidityOf(value: unknown): number {
  if (value === '' || value === null || value === undefined) return DEFAULT_TURBIDITY;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TURBIDITY;
  return Math.min(Math.max(numeric, 0), 1);
}

/** How dirty water is when nobody has said: not at all. */
export const DEFAULT_DIRT = 0;

/**
 * How dirty water is, from 0 for clean to 1 for water thick with scum, read from what was stored.
 * An empty or unreadable value reads as clean.
 */
export function dirtOf(value: unknown): number {
  if (value === '' || value === null || value === undefined) return DEFAULT_DIRT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DIRT;
  return Math.min(Math.max(numeric, 0), 1);
}
