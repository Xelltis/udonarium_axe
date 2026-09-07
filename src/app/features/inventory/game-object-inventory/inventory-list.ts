import { matchesSearchText, normalizeSearchText } from '@axe/core/util/text-search';
import { normalizeFolderPath } from '@axe/domain/character/character-folder';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface InventoryRow {
  readonly object: TabletopObject;
  readonly identifier: string;
  readonly folderPath: string;
}

export function buildInventoryRow(object: TabletopObject, folderName: string): InventoryRow {
  return { object, identifier: object.identifier, folderPath: normalizeFolderPath(folderName) };
}

export function inventorySearchText(row: InventoryRow, ownerName: string, elementTexts: readonly string[]): string {
  return normalizeSearchText([row.object.name, ownerName, row.folderPath, ...elementTexts].join(' '));
}

export function filterInventoryRows(
  rows: readonly InventoryRow[],
  terms: readonly string[],
  searchTextOf: (row: InventoryRow) => string
): InventoryRow[] {
  if (terms.length < 1) return [...rows];
  return rows.filter((row) => matchesSearchText(searchTextOf(row), terms));
}

export type InventoryHiddenFilter = 'all' | 'only' | 'exclude';

export const INVENTORY_HIDDEN_FILTERS: readonly InventoryHiddenFilter[] = ['all', 'only', 'exclude'];

export type InventoryHiddenDisplay = 'dim' | 'full';

export function filterInventoryRowsByHidden(
  rows: readonly InventoryRow[],
  filter: InventoryHiddenFilter,
  isHidden: (row: InventoryRow) => boolean
): InventoryRow[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => isHidden(row) === (filter === 'only'));
}

export interface SideBand<T> {
  readonly side: string;
  readonly name: string;
  readonly color: string;
  readonly rows: readonly T[];
}

export interface SideMembership {
  readonly side: string;
  readonly name: string;
  readonly color: string;
  readonly members: readonly { readonly identifier: string }[];
}

/**
 * The rows gathered under the sides of the round, in the order the sides are taken.
 *
 * A row belonging to no side comes last, under a band of its own with no name: a piece that
 * sits the round out still has to be listed somewhere, and calling it a side would be a lie.
 * Bands with nobody in them are dropped, so an empty party leaves no heading behind.
 */
export function bandRowsBySide<T>(
  rows: readonly T[],
  sides: readonly SideMembership[],
  idOf: (row: T) => string
): SideBand<T>[] {
  const place = new Map<string, number>();
  sides.forEach((group, index) => {
    for (const member of group.members) place.set(member.identifier, index);
  });

  const gathered: T[][] = sides.map(() => []);
  const outside: T[] = [];
  for (const row of rows) {
    const index = place.get(idOf(row));
    if (index === undefined) outside.push(row);
    else gathered[index].push(row);
  }

  const bands: SideBand<T>[] = sides
    .map((group, index) => ({ side: group.side, name: group.name, color: group.color, rows: gathered[index] }))
    .filter((band) => band.rows.length > 0);
  if (outside.length > 0) bands.push({ side: '', name: '', color: '', rows: outside });
  return bands;
}
