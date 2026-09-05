/**
 * The cell the map editor painted an object onto.
 *
 * An object the editor painted answers with the cell it belongs to; one a person placed by
 * hand answers with nothing at all. That is the whole of how the two are told apart, and it
 * is what keeps the editor from laying a hand on anything it did not put there.
 */

/** What an object holds where nobody painted it, which is every object until one is. */
export const NOT_PAINTED = '';

export interface PaintedCell {
  col: number;
  row: number;
}

export function encodePaintedCell(cell: PaintedCell): string {
  return `${cell.col},${cell.row}`;
}

/**
 * The cell an object was painted onto, or nothing where it was placed by hand.
 *
 * Anything that is not two whole counts is read as nothing rather than guessed at: an object
 * the editor cannot place is one it must leave alone.
 */
export function parsePaintedCell(held: unknown): PaintedCell | null {
  const text = `${held ?? ''}`;
  const comma = text.indexOf(',');
  if (comma < 1) return null;
  const left = text.slice(0, comma);
  const right = text.slice(comma + 1);
  // Number('') is 0, so a half with nothing in it would otherwise read as the first row.
  if (right.length < 1) return null;
  const col = Number(left);
  const row = Number(right);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  if (col < 0 || row < 0) return null;
  return { col, row };
}

/** Whether the map editor is the one that put this object on the table. */
export function isPaintedByEditor(held: unknown): boolean {
  return parsePaintedCell(held) !== null;
}
