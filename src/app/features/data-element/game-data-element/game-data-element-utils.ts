import { DataElement, DataElementFieldType, DataElementRole, DataElementViewMode } from '@axe/domain/data/data-element';

/**
 * Escapes a sheet value for use as HTML, so what somebody typed shows as written rather than as
 * markup.
 */
export function escapeHtml(text: string | number): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
 * Whether a field has settings of its own to open: a cell of a table, or a select, number,
 * resource, calculated or image field.
 */
export function fieldHasOptions(element: DataElement): boolean {
  return isTableCellField(element) || KINDS_WITH_OPTIONS.has(element.fieldType);
}
