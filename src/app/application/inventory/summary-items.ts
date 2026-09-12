import { isGaugeShownOnPiece } from '@axe/domain/character/piece-gauge';
import { resourceElementsOf } from '@axe/domain/character/resource-catalog';
import { DataElement } from '@axe/domain/data/data-element';

/** How many items are worked out for a room that has named none, so a full sheet is not a wall of columns. */
const DERIVED_ITEM_LIMIT = 8;

interface Sheeted {
  detailDataElement: DataElement | null;
}

/**
 * What to show of everybody where the room has not said what matters to it.
 *
 * The resources a sheet marks to show on its piece come first: somebody has already chosen to
 * watch those. After them come the ones the most pieces share, which is what a table has in
 * common. A room that names its own items is left alone, and this is never written back into
 * the room's own setting - it is only what to show while that setting is empty.
 */
export function derivedItemNames(pieces: readonly Sheeted[]): string[] {
  const marked: string[] = [];
  const timesCarried = new Map<string, number>();

  for (const piece of pieces) {
    for (const element of resourceElementsOf(piece)) {
      const name = element.name.trim();
      if (name.length < 1) continue;
      timesCarried.set(name, (timesCarried.get(name) ?? 0) + 1);
      if (isGaugeShownOnPiece(element) && !marked.includes(name)) marked.push(name);
    }
  }

  const shared = [...timesCarried]
    .filter(([name]) => !marked.includes(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  return [...marked, ...shared].slice(0, DERIVED_ITEM_LIMIT);
}

/** The items of the full view: what the room named, or what its pieces carry while it has named none. */
export function displayItemNames(tags: readonly string[], pieces: readonly Sheeted[]): string[] {
  return tags.length > 0 ? [...tags] : derivedItemNames(pieces);
}

/**
 * The same for the table, where a state the room keeps is a column of boxes.
 *
 * The states come after the resources, so the numbers a fight is read by stay at the left.
 */
export function tableItemNames(
  tags: readonly string[],
  pieces: readonly Sheeted[],
  ailmentNames: readonly string[] = []
): string[] {
  if (tags.length > 0) return [...tags];
  const derived = derivedItemNames(pieces);
  // The states alone would be a row of empty boxes under a table with nothing to put in them.
  if (derived.length < 1) return [];
  return [...derived, ...ailmentNames.filter((name) => !derived.includes(name))];
}
