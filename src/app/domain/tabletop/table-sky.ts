/**
 * What a table shows over its board where the camera looks past it: the table's background picture,
 * as it always has, or a sky that turns with the story's clock.
 */
export const TABLE_SKY_KINDS = ['', 'clock'] as const;

export type TableSkyKind = (typeof TABLE_SKY_KINDS)[number];

/** Reads a stored kind of sky, anything unknown, empty or missing as the table's background picture. */
export function tableSkyKindOf(value: unknown): TableSkyKind {
  return typeof value === 'string' && (TABLE_SKY_KINDS as readonly string[]).includes(value)
    ? (value as TableSkyKind)
    : '';
}
