import { GameTable } from '@axe/domain/tabletop/game-table';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/** The smallest and largest cell, in px, a table may be given. */
export const MIN_CELL_PX = 16;
export const MAX_CELL_PX = 256;

/** A cell size as a table may take it: a whole number of px within the bounds. */
export function clampCellPx(value: number): number {
  if (!Number.isFinite(value)) return MIN_CELL_PX;
  return Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, Math.round(value)));
}

/**
 * Moves what stands on a table so that it keeps to the same cells when the table's cells go from
 * `from` px across to `to`: the table's own pieces, such as terrain and masks, and those of
 * `shared` that are out on the table, such as characters, which every table shows at the same
 * place. Places and heights are kept in px and are scaled; sizes, lengths and radii are kept in
 * cells and are left alone. A piece listed twice is moved once.
 */
export function rescaleTableContents(
  table: GameTable,
  from: number,
  to: number,
  shared: readonly TabletopObject[]
): void {
  if (!(from > 0) || !(to > 0) || from === to) return;
  const ratio = to / from;
  const moved = new Set<TabletopObject>();
  const move = (piece: TabletopObject) => {
    if (moved.has(piece)) return;
    moved.add(piece);
    piece.location = { ...piece.location, x: piece.location.x * ratio, y: piece.location.y * ratio };
    piece.posZ = piece.posZ * ratio;
  };
  for (const child of table.children) if (child instanceof TabletopObject) move(child);
  for (const piece of shared) if (piece.location.name === 'table') move(piece);
}
