import { defaultSlotsOf, plainNumberIn, readDefault } from '@axe/domain/character/default-value';
import { DataElement, DataElementFieldType, DataElementRole, DataElementViewMode } from '@axe/domain/data/data-element';

/**
 * Whether a sheet value is a web address starting with http or https, which the sheet shows as a
 * link. A number never is.
 */
export function isUrlText(text: string | number): boolean {
  if (typeof text !== 'string') return false;
  return text.startsWith('https://') || text.startsWith('http://');
}

/**
 * A field together with the row and the table above it, which decide whether it is a table cell.
 * Missing ancestors are left out.
 */
export function tableCellLineage(element: DataElement): DataElement[] {
  const row = element.parent instanceof DataElement ? element.parent : null;
  const table = row?.parent instanceof DataElement ? row.parent : null;
  return [element, row, table].filter((node): node is DataElement => node !== null);
}

/** Whether a field is a cell of a table: it sits in a group whose parent is set to show as a table. */
export function isTableCellField(element: DataElement): boolean {
  if (element.fieldRole !== DataElementRole.FIELD) return false;
  const [, row, table] = tableCellLineage(element);
  return row?.fieldRole === DataElementRole.GROUP && table?.viewMode === DataElementViewMode.TABLE;
}

const KINDS_WITH_OPTIONS: ReadonlySet<string> = new Set([
  DataElementFieldType.SELECT,
  DataElementFieldType.NUMBER,
  DataElementFieldType.RESOURCE,
  DataElementFieldType.CALC,
  DataElementFieldType.IMAGE,
]);

/**
 * Whether a field whose kind has no other setting still has a default to set: a checkbox, and a line
 * of text while it holds a number or keeps a default already. A line of prose has none.
 */
function hasDefaultSetting(element: DataElement): boolean {
  if (!defaultSlotsOf(element).includes('now')) return false;
  if (element.fieldType === DataElementFieldType.CHECK) return true;
  if (element.fieldType !== DataElementFieldType.TEXT) return false;
  return plainNumberIn(element.value) != null || readDefault(element, 'now') != null;
}

/**
 * Whether a field has settings of its own to open: a cell of a table, a select, number, resource,
 * calculated or image field, or one of another kind that may keep a default.
 */
export function fieldHasOptions(element: DataElement): boolean {
  return isTableCellField(element) || KINDS_WITH_OPTIONS.has(element.fieldType) || hasDefaultSetting(element);
}
