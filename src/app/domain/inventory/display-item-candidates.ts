import { DataElement, DataElementRole, DataElementType } from '@axe/domain/data/data-element';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { SUMMARY_NEW_LINE } from '@axe/domain/data/summary-tag-list';

/** Fields an inventory row draws nothing useful for: long text, pictures and whole tables. */
const UNLISTED_TYPES: ReadonlySet<string> = new Set([
  DataElementType.MARKDOWN,
  DataElementType.IMAGE,
  DataElementType.CHECK_TABLE,
]);

/**
 * The item names offered for a room's display items, taken from the fields of the given sheets.
 *
 * Fields the inventory draws nothing for are left out, and so are names the display-item line
 * cannot hold or read back as themselves: one with a quote or a backslash in it. The names most sheets carry come first, so the items a party shares lead and one
 * monster's oddity trails; names carried as often stay in the order they were first met.
 */
export function displayItemCandidates(details: readonly (DataElement | null)[]): string[] {
  const counts = new Map<string, number>();
  for (const detail of details) {
    const names = new Set<string>();
    for (const element of collectDataElements(detail)) {
      if (element.fieldRole !== DataElementRole.FIELD || UNLISTED_TYPES.has(element.type)) continue;
      const name = element.name.trim();
      if (name.length < 1 || name === SUMMARY_NEW_LINE || /["\\]/.test(name)) continue;
      names.add(name);
    }
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}
