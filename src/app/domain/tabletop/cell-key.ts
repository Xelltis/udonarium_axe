export interface CellKey {
  col: number;
  row: number;
}

export function encodeCellKey(cell: CellKey): string {
  return `${cell.col},${cell.row}`;
}

/**
 * The cell a key names, or nothing where it names none.
 *
 * Anything that is not two whole counts is read as nothing rather than guessed at.
 */
export function parseCellKey(held: unknown): CellKey | null {
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
