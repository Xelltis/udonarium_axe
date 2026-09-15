/**
 * How a piece shows which way it is facing.
 *
 * Seen from directly above there is nothing to show it: the picture is turned to the reader
 * whichever way the piece stands, and turning it is switched off. A table can either let the
 * picture itself be turned, or leave it facing the reader and put a mark beside it.
 */
export const TABLE_FACING_MARKS = ['none', 'turn', 'arrow'] as const;

export type TableFacingMark = (typeof TABLE_FACING_MARKS)[number];

export const DEFAULT_TABLE_FACING_MARK: TableFacingMark = 'none';

/** Reads a stored facing mark setting, falling back to none for anything unknown. */
export function asTableFacingMark(value: unknown): TableFacingMark {
  return typeof value === 'string' && (TABLE_FACING_MARKS as readonly string[]).includes(value)
    ? (value as TableFacingMark)
    : DEFAULT_TABLE_FACING_MARK;
}
