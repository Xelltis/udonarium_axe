/** How the picture laid in front of the table is fitted to the screen. */
export const TABLE_FOREGROUND_FITS = ['cover', 'contain', 'fill'] as const;

export type TableForegroundFit = (typeof TABLE_FOREGROUND_FITS)[number];

/** Filling the screen and cutting off what overflows, which is how a backdrop is laid. */
export const DEFAULT_TABLE_FOREGROUND_FIT: TableForegroundFit = 'cover';

/** The picture a table lays over the whole view, in front of the board and everything on it. */
export interface TableForeground {
  readonly imageIdentifier: string;
  /** From just over 0 to 1. */
  readonly opacity: number;
  readonly fit: TableForegroundFit;
}

/** The identifiers the app writes for a table picture nobody has chosen, and for the empty one picked. */
const NO_PICTURE: ReadonlySet<string> = new Set(['imageIdentifier', 'null']);

/**
 * How opaque the picture is, from 0 to 1.
 *
 * A peer that has never heard of the picture sends no opacity, and an empty value is read as fully
 * opaque rather than as nought, which would lay a picture nobody can see.
 */
export function foregroundOpacityOf(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 1;
}

/** How the picture is fitted, anything unknown read as filling the screen. */
export function foregroundFitOf(value: unknown): TableForegroundFit {
  return typeof value === 'string' && (TABLE_FOREGROUND_FITS as readonly string[]).includes(value)
    ? (value as TableForegroundFit)
    : DEFAULT_TABLE_FOREGROUND_FIT;
}

/**
 * The picture a table lays in front of everything, or null where it lays none: no picture chosen,
 * or one nobody could see for being wholly clear.
 */
export function tableForegroundOf(table: {
  foregroundImageIdentifier: unknown;
  foregroundOpacity: unknown;
  foregroundFit: unknown;
}): TableForeground | null {
  const imageIdentifier = `${table.foregroundImageIdentifier ?? ''}`.trim();
  if (imageIdentifier.length < 1 || NO_PICTURE.has(imageIdentifier)) return null;
  const opacity = foregroundOpacityOf(table.foregroundOpacity);
  if (opacity <= 0) return null;
  return { imageIdentifier, opacity, fit: foregroundFitOf(table.foregroundFit) };
}
