import { DataElement, DataElementAttribute, DataElementRole } from '@axe/domain/data/data-element';

export interface TableColumn {
  name: string;
  label: string;
  group: string;
  kind: string;
}

export interface TableColumnHeaderGroup {
  key: string;
  label: string;
  span: number;
}

/** The table's rows, meaning the children that have cells of their own, control rows included. */
export function getRawTableRows(element: DataElement): DataElement[] {
  return element.children.filter((child) => child.children.length > 0);
}

/** Whether an element has the shape a table view needs: at least one row, and every row a group of fields. */
export function canRenderAsTable(element: DataElement): boolean {
  if (element.children.length < 1) return false;
  for (const row of element.children) {
    if (row.fieldRole === DataElementRole.FIELD || row.children.length < 1) return false;
    for (const child of row.children) {
      if (child.fieldRole !== DataElementRole.FIELD) return false;
    }
  }
  return true;
}

/**
 * Whether a row exists only to carry gap cells, with every other cell blank.
 *
 * Such a row holds column settings rather than data, so it is left out of the rows a table shows.
 */
export function isTableControlRow(row: DataElement): boolean {
  const hasGapCell = row.children.some((child) => child.getAttribute(DataElementAttribute.CELL_KIND).trim() === 'gap');
  if (!hasGapCell) return false;
  return row.children.every((child) => {
    if (child.getAttribute(DataElementAttribute.CELL_KIND).trim() === 'gap') return true;
    return String(child.value ?? '').trim() === '' && child.getAttribute(DataElementAttribute.CELL_TEXT).trim() === '';
  });
}

/** The rows a table shows as data, leaving out control rows. */
export function getTableBodyRows(element: DataElement): DataElement[] {
  return getRawTableRows(element).filter((row) => !isTableControlRow(row));
}

function createTableColumn(cell: DataElement): TableColumn {
  return {
    name: cell.name,
    label: cell.getAttribute(DataElementAttribute.COLUMN_LABEL).trim() || cell.name,
    group: cell.getAttribute(DataElementAttribute.COLUMN_GROUP).trim(),
    kind: cell.getAttribute(DataElementAttribute.CELL_KIND).trim(),
  };
}

/**
 * The table's columns, one per distinct field name across all rows, in the order names first appear.
 *
 * A column takes its label, group and kind from the first cell seen with that name.
 */
export function getTableColumns(element: DataElement): TableColumn[] {
  const columns: TableColumn[] = [];
  for (const row of getRawTableRows(element)) {
    for (const child of row.children) {
      if (child.fieldRole !== DataElementRole.FIELD || columns.some((column) => column.name === child.name)) continue;
      columns.push(createTableColumn(child));
    }
  }
  return columns;
}

/** The top header row: neighbouring columns with the same group, or the same label when ungrouped, share one cell. */
export function buildTableColumnHeaderGroups(columns: readonly TableColumn[]): TableColumnHeaderGroup[] {
  const groups: TableColumnHeaderGroup[] = [];
  for (const [index, column] of columns.entries()) {
    const label = column.group || column.label;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.span += 1;
    } else {
      groups.push({ key: `${index}:${label}`, label, span: 1 });
    }
  }
  return groups;
}

/** The row's cell in the named column, or null when the row has none. */
export function getTableCell(row: DataElement, columnName: string): DataElement | null {
  return row.children.find((child) => child.fieldRole === DataElementRole.FIELD && child.name === columnName) ?? null;
}

/** Whether a column is a gap between columns rather than a column of data. */
export function isGapColumn(column: TableColumn): boolean {
  return column.kind === 'gap';
}

/** Whether a table's check cell is ticked: `1`, `true`, `x` or `checked`, in any case. */
export function isCheckCellChecked(cell: DataElement): boolean {
  const value = String(cell.value).trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'x' || value === 'checked';
}

/**
 * The value to store in a check cell after a click.
 *
 * Follows the checkbox's own state when the event came from one, and otherwise flips the stored value.
 */
export function nextCheckCellValue(cell: DataElement, event?: Event): 0 | 1 {
  if (event?.target instanceof HTMLInputElement) return event.target.checked ? 1 : 0;
  return isCheckCellChecked(cell) ? 0 : 1;
}

/** The text shown beside a cell's value, such as a check cell's label; empty when it has none. */
export function getCellLabel(cell: DataElement): string {
  return cell.getAttribute(DataElementAttribute.CELL_TEXT).trim();
}

/** The cell's unit with a leading space, ready to follow the value; empty when it has no unit. */
export function getCellUnit(cell: DataElement): string {
  const unit = cell.getAttribute(DataElementAttribute.UNIT).trim();
  return unit ? ` ${unit}` : '';
}

/** Splits a select field's choices on line breaks or commas, trimming each and dropping blanks. */
export function parseSelectChoices(choices: string): string[] {
  return choices
    .split(/\r?\n|,/)
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0);
}

/** The choices a select cell offers. */
export function getSelectOptions(cell: DataElement): string[] {
  return parseSelectChoices(cell.getAttribute(DataElementAttribute.CHOICES));
}

/** Whether a select cell's stored value is still one of its choices, which it may not be after they change. */
export function isSelectValueListed(cell: DataElement): boolean {
  return getSelectOptions(cell).includes(String(cell.value ?? ''));
}

/** The first gap cell in a gap column, which holds that gap's settings; null for any other column. */
export function findGapCellInColumn(element: DataElement, column: TableColumn): DataElement | null {
  if (!isGapColumn(column)) return null;
  for (const row of getRawTableRows(element)) {
    const cell = getTableCell(row, column.name);
    if (cell?.getAttribute(DataElementAttribute.CELL_KIND).trim() === 'gap') return cell;
  }
  return null;
}
