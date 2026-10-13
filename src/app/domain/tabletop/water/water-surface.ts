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

/** How much of the water floating leaves cover when nobody has said: none. */
export const DEFAULT_LEAVES = 0;

/**
 * How much of the water floating leaves cover, from 0 for none to 1 for a pond crowded with them,
 * read from what was stored. An empty or unreadable value reads as none.
 */
export function leavesOf(value: unknown): number {
  if (value === '' || value === null || value === undefined) return DEFAULT_LEAVES;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LEAVES;
  return Math.min(Math.max(numeric, 0), 1);
}

/**
 * How fast water flows, from 0 for still water to 1 for a racing river, read from what was stored.
 * An empty or unreadable value reads as still.
 */
export function flowSpeedOf(value: unknown): number {
  if (value === '' || value === null || value === undefined) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), 1);
}

/**
 * Which way water flows, in degrees clockwise from the top of the table, read from what was
 * stored. An empty or unreadable value reads as towards the top.
 */
export function flowDirectionOf(value: unknown): number {
  if (value === '' || value === null || value === undefined) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return ((numeric % 360) + 360) % 360;
}
