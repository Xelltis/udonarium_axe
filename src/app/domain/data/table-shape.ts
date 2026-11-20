import { GameObject } from '@axe/core/sync/game-object';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  type DataElementFieldTypeValue,
  DataElementRole,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import {
  canRenderAsTable,
  getRawTableRows,
  getTableBodyRows,
  getTableColumns,
  isCheckCellChecked,
  isGapColumn,
  isTableControlRow,
  tableColumnsOf,
} from '@axe/domain/data/table-layout';

/** What the cells of a column hold, as the table builder offers the kinds. */
export type TableCellKind = 'check' | 'text' | 'number' | 'select';

export const TABLE_CELL_KINDS: readonly TableCellKind[] = ['check', 'text', 'number', 'select'];

/**
 * A column of a table as it is built: the name its cells go by, which `{name}` refers to; the words
 * over it, empty for its name; the heading it is grouped under, empty for none; what its cells hold,
 * and a select's choices; and the name it had before, null for a column the table did not have.
 */
export interface TableShapeColumn {
  readonly name: string;
  readonly label: string;
  readonly group: string;
  readonly kind: TableCellKind;
  readonly choices: string;
  readonly from: string | null;
}

/** A row of a table as it is built: its name, and the row it was, null for a row the table did not have. */
export interface TableShapeRow {
  readonly name: string;
  readonly from: string | null;
}

/** The rows and columns of a table as a shape was read from it, in order, each as it then read. */
export interface TableShapeSeen {
  readonly columns: readonly TableShapeColumn[];
  readonly rows: readonly TableShapeRow[];
}

/**
 * A table as it is built: its columns and its rows, in order, the names of the gap columns the table
 * keeps as they are, which no column may go by, and the rows and columns the shape was read from, as
 * they then read. Building takes away only rows and columns the shape was read from and no longer has;
 * one added to the table since, as by another seat, is kept. A shape is built only on a table whose
 * rows and columns it was read from read as they did (see {@link tableBuildProblems}).
 */
export interface TableShape {
  readonly columns: readonly TableShapeColumn[];
  readonly rows: readonly TableShapeRow[];
  readonly gaps?: readonly string[];
  readonly seen?: TableShapeSeen;
}

const KIND_OF_FIELD: Readonly<Record<string, TableCellKind>> = {
  [DataElementFieldType.CHECK]: 'check',
  [DataElementFieldType.NUMBER]: 'number',
  [DataElementFieldType.SELECT]: 'select',
};

const FIELD_OF_KIND: Readonly<Record<TableCellKind, DataElementFieldTypeValue>> = {
  check: DataElementFieldType.CHECK,
  text: DataElementFieldType.TEXT,
  number: DataElementFieldType.NUMBER,
  select: DataElementFieldType.SELECT,
};

/** What a cell holds, as the table builder names it: anything but a check, a number or a select is text. */
function kindOf(cell: DataElement): TableCellKind {
  return KIND_OF_FIELD[cell.fieldType] ?? 'text';
}

/**
 * A table as it stands, to be built anew: its columns, gap columns left out, and its rows, the rows
 * that only hold the gaps' settings left out. A column's words and group are those the table shows
 * over it, and its kind and choices those of the first of its cells in a row of the table's body.
 */
export function tableShapeOf(table: DataElement): TableShape {
  const read = readTable(table);
  return { ...read, seen: { columns: read.columns, rows: read.rows } };
}

/**
 * A table's columns, rows and gap columns as they stand (see {@link tableShapeOf}), read from the body
 * rows `reads` keeps, all of them unless told otherwise, and the rows holding the gaps' settings:
 * which columns there are, in what order, and their words, groups, kinds and choices included.
 */
function readTable(
  table: DataElement,
  reads: (row: DataElement) => boolean = () => true
): Required<Omit<TableShape, 'seen'>> {
  const raw = getRawTableRows(table).filter((row) => isTableControlRow(row) || reads(row));
  const rows = raw.filter((row) => !isTableControlRow(row));
  const read = tableColumnsOf(raw);
  const columns = read
    .filter((column) => !isGapColumn(column))
    .map((column): TableShapeColumn => {
      const cell = rows.flatMap((row) => row.children).find((child) => child.name === column.name) ?? null;
      return {
        name: column.name,
        label: column.label === column.name ? '' : column.label,
        group: column.group,
        kind: cell ? kindOf(cell) : 'text',
        choices: cell?.getAttribute(DataElementAttribute.CHOICES) ?? '',
        from: column.name,
      };
    });
  const gaps = read.filter((column) => isGapColumn(column)).map((column) => column.name);
  return { columns, rows: rows.map((row) => ({ name: row.name, from: row.identifier })), gaps };
}

/** The identifiers of the rows and the names of the columns a shape was read from: none where it was read from no table. */
function seenOf(shape: TableShape): { rows: Set<string | null>; columns: Set<string> } {
  return {
    rows: new Set((shape.seen?.rows ?? []).map((row) => row.from)),
    columns: new Set((shape.seen?.columns ?? []).map((column) => column.name)),
  };
}

/**
 * What of a table building a shape on it leaves as it is: the body rows and the columns the shape was
 * not read from, as ones another seat added since, by name, which no row or column of the shape may
 * take, besides its gap columns.
 */
function standingApart(table: DataElement, shape: TableShape): { rows: string[]; columns: string[] } {
  const seen = seenOf(shape);
  return {
    rows: getTableBodyRows(table)
      .filter((row) => !seen.rows.has(row.identifier))
      .map((row) => row.name),
    columns: getTableColumns(table)
      .filter((column) => !isGapColumn(column) && !seen.columns.has(column.name))
      .map((column) => column.name),
  };
}

/**
 * What keeps a shape from being built on a table as it stands now (see {@link tableShapeProblems}):
 * a row or column the shape was read from that no longer reads as it did, as another seat took it
 * away, named it again, moved it or changed its words, group, kind or choices while the shape was
 * being built, which builds nothing rather than write what the shape read over what was changed;
 * and besides what is wrong with the shape itself, a row or column taking the name of one the table
 * holds apart from it, a gap column or one added since the shape was read.
 */
export function tableBuildProblems(table: DataElement, shape: TableShape): TableShapeProblem[] {
  if (changedSince(table, shape)) return ['changedSince'];
  const apart = standingApart(table, shape);
  const gaps = getTableColumns(table)
    .filter((column) => isGapColumn(column))
    .map((column) => column.name);
  return tableShapeProblems({
    ...shape,
    gaps: [...gaps, ...apart.columns],
    rows: [...shape.rows, ...apart.rows.map((name) => ({ name, from: null }))],
  });
}

/**
 * Whether the rows and columns a shape was read from read otherwise now: any of them gone, named
 * again, moved among the others, or a column's words, group, kind or choices changed, everything a
 * build writes. All of it is read again from the rows the shape was read from alone, so rows and
 * columns added since, and the values of cells, are not counted.
 */
function changedSince(table: DataElement, shape: TableShape): boolean {
  if (!shape.seen) return false;
  const seen = seenOf(shape);
  const now = readTable(table, (row) => seen.rows.has(row.identifier));
  const standing: TableShapeSeen = {
    columns: now.columns.filter((column) => seen.columns.has(column.name)),
    rows: now.rows.filter((row) => seen.rows.has(row.from)),
  };
  const read: TableShapeSeen = { columns: shape.seen.columns, rows: shape.seen.rows };
  return JSON.stringify(standing) !== JSON.stringify(read);
}

/**
 * Whether a group or section may be built as a table: one that reads as a table already, or one that
 * holds nothing yet. One holding fields, or groups of another shape, may not, as building it would
 * leave what it holds stranded beside the table's rows.
 */
export function canBuildTable(element: DataElement): boolean {
  return element.fieldRole !== DataElementRole.FIELD && (element.children.length < 1 || canRenderAsTable(element));
}

/**
 * What keeps a table from being built: no column, no row, a blank name, two columns of one name, gap
 * columns counted, or two rows of one name, as two groups side by side may not share one.
 */
export type TableShapeProblem = 'noColumn' | 'noRow' | 'blankName' | 'sameName' | 'sameRowName' | 'changedSince';

/** What is wrong with a table as it is to be built, one line for each thing: none for one that may be built. */
export function tableShapeProblems(shape: TableShape): TableShapeProblem[] {
  const problems: TableShapeProblem[] = [];
  if (shape.columns.length < 1) problems.push('noColumn');
  if (shape.rows.length < 1) problems.push('noRow');
  const names = [...shape.columns.map((column) => column.name.trim()), ...shape.rows.map((row) => row.name.trim())];
  if (names.some((name) => name.length < 1)) problems.push('blankName');
  const columnNames = [...shape.columns.map((column) => column.name.trim()), ...(shape.gaps ?? [])];
  if (new Set(columnNames).size !== columnNames.length) problems.push('sameName');
  const rowNames = shape.rows.map((row) => row.name.trim());
  if (new Set(rowNames).size !== rowNames.length) problems.push('sameRowName');
  return problems;
}

/** A column of checks to add at the end of a table, named `base` and the first number from its place on that no column goes by. */
export function newTableColumn(shape: TableShape, base: string): TableShapeColumn {
  const names = new Set([...shape.columns.map((column) => column.name.trim()), ...(shape.gaps ?? [])]);
  let number = shape.columns.length + 1;
  while (names.has(`${base}${number}`)) number++;
  return { name: `${base}${number}`, label: '', group: '', kind: 'check', choices: '', from: null };
}

/** A row to add at the end of a table, numbered on from the highest row named by a number, or by its place where none is. */
export function newTableRow(shape: TableShape): TableShapeRow {
  const numbers = shape.rows.map((row) => Number(row.name.trim())).filter((number) => Number.isInteger(number));
  return { name: `${numbers.length > 0 ? Math.max(...numbers) + 1 : shape.rows.length + 1}`, from: null };
}

/** A list with the thing at `index` moved a place towards its start or its end, or as it was where it cannot go. */
export function movedAPlace<T>(list: readonly T[], index: number, by: -1 | 1): readonly T[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Whether a cell holds anything: a ticked check, or any other value or words beside it. */
function holdsValue(cell: DataElement): boolean {
  if (cell.fieldType === DataElementFieldType.CHECK) return isCheckCellChecked(cell);
  return `${cell.value ?? ''}`.trim() !== '' || cell.getAttribute(DataElementAttribute.CELL_TEXT).trim() !== '';
}

/** How many cells holding something building the table this way takes away, with the rows and columns it drops (see `TableShape.seen`). */
export function cellsLostBy(table: DataElement, shape: TableShape): number {
  let lost = 0;
  for (const row of getTableBodyRows(table)) {
    for (const cell of row.children) {
      if (isGapCell(cell) || !holdsValue(cell)) continue;
      if (dropsRow(shape, row) || dropsColumn(shape, cell.name)) lost++;
    }
  }
  return lost;
}

/** Whether building the shape takes a body row away: one it was read from and no longer has. */
function dropsRow(shape: TableShape, row: DataElement): boolean {
  return seenOf(shape).rows.has(row.identifier) && !shape.rows.some((each) => each.from === row.identifier);
}

/** Whether building the shape takes a column away, by its name as it stands: one it was read from and no longer has. */
function dropsColumn(shape: TableShape, name: string): boolean {
  return seenOf(shape).columns.has(name) && !shape.columns.some((each) => each.from === name);
}

/** A value carried into a cell of another kind, as far as it reads as one: ticked or not, a number, or as it was. */
function valueAs(kind: TableCellKind, cell: DataElement): string | number {
  if (kind === 'check')
    return isCheckCellChecked(cell) || (cell.fieldType !== DataElementFieldType.CHECK && Number(cell.value) > 0)
      ? 1
      : 0;
  if (cell.fieldType === DataElementFieldType.CHECK) return isCheckCellChecked(cell) ? 1 : '';
  if (kind === 'number') {
    const number = Number(`${cell.value ?? ''}`.trim());
    return `${cell.value ?? ''}`.trim() !== '' && Number.isFinite(number) ? number : '';
  }
  return cell.value ?? '';
}

/** Makes a cell of a column, holding nothing. */
function newCell(column: TableShapeColumn): DataElement {
  return DataElement.create(column.name.trim(), column.kind === 'check' ? 0 : '', {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]: FIELD_OF_KIND[column.kind],
    type: DataElement.dataTypeFromFieldType(FIELD_OF_KIND[column.kind]),
  });
}

/**
 * What of a column the builder changed, to be written onto its cells: everything of a new column, and
 * of a kept one only what differs from the column as it stood, so a cell whose words or group differ
 * from the rest of its column keeps them while nobody changed them.
 */
interface ColumnChange {
  readonly column: TableShapeColumn;
  readonly label: boolean;
  readonly group: boolean;
  readonly kind: boolean;
  readonly choices: boolean;
}

function changeOf(column: TableShapeColumn, before: TableShapeColumn | undefined): ColumnChange {
  return {
    column,
    label: !before || before.label !== column.label,
    group: !before || before.group !== column.group,
    kind: !before || before.kind !== column.kind,
    choices: !before || before.choices !== column.choices,
  };
}

/**
 * Writes onto a cell what of its column changed: its name always, its words, group, kind and choices
 * where they changed, its value carried into a new kind. A cell of the row holding the gaps' settings
 * keeps its kind and value, which are no column's but the settings'.
 */
function fitCell(cell: DataElement, change: ColumnChange, holdsSettings: boolean): void {
  const column = change.column;
  const name = column.name.trim();
  if (cell.name !== name) cell.name = name;
  const writeOrRemove = (attribute: string, value: string) => {
    if (value.trim()) {
      if (cell.getAttribute(attribute) !== value.trim()) cell.setAttribute(attribute, value.trim());
    } else if (cell.getAttribute(attribute) !== '') {
      cell.removeAttribute(attribute);
    }
  };
  if (change.label) writeOrRemove(DataElementAttribute.COLUMN_LABEL, column.label === name ? '' : column.label);
  if (change.group) writeOrRemove(DataElementAttribute.COLUMN_GROUP, column.group);
  if (holdsSettings) return;
  if (change.kind && kindOf(cell) !== column.kind) {
    const value = valueAs(column.kind, cell);
    cell.setFieldType(FIELD_OF_KIND[column.kind]);
    cell.setAttribute('type', DataElement.dataTypeFromFieldType(FIELD_OF_KIND[column.kind]));
    cell.value = value;
  }
  if (column.kind === 'select' && change.choices) writeOrRemove(DataElementAttribute.CHOICES, column.choices);
}

/** Whether a cell is a gap between columns, which a skill table's settings own. */
function isGapCell(cell: DataElement): boolean {
  return cell.getAttribute(DataElementAttribute.CELL_KIND).trim() === 'gap';
}

/**
 * A row's cells in the order the columns go, each gap cell kept right after the cell it followed, or
 * first where it followed none that is kept.
 */
function orderedCells(row: DataElement, cells: readonly DataElement[]): DataElement[] {
  const ordered = [...cells];
  let after: DataElement | null = null;
  for (const child of row.children) {
    if (!isGapCell(child)) {
      if (cells.includes(child)) after = child;
      continue;
    }
    ordered.splice(after ? ordered.indexOf(after) + 1 : 0, 0, child);
    after = child;
  }
  return ordered;
}

/**
 * Fits a row's cells to the columns: each cell of a kept column written as its column says, and every
 * other cell of a column the shape was read from taken away, gaps and cells of columns added since
 * kept after them. Each column's cell is the one its former name finds as the row stands, found for
 * every column before any is renamed, so columns renamed into each other's names keep their own. A
 * cell is made for a column the row lacks where `makes`, as a body row has one of every column; a row
 * holding the gaps' settings is given none, as it would then no longer read as one.
 */
function fitRow(row: DataElement, shape: TableShape, changes: readonly ColumnChange[], makes: boolean): void {
  const found = changes.map((change) =>
    change.column.from !== null
      ? (row.children.find((each) => each.name === change.column.from && !isGapCell(each)) ?? null)
      : null
  );
  const cells = changes.flatMap((change, index) => {
    const cell = found[index] ?? (makes ? newCell(change.column) : null);
    if (!cell) return [];
    fitCell(cell, change, !makes);
    return [cell];
  });
  const apart = row.children.filter(
    (cell) => !cells.includes(cell) && !isGapCell(cell) && !dropsColumn(shape, cell.name)
  );
  for (const cell of [...row.children]) {
    if (!cells.includes(cell) && !apart.includes(cell) && !isGapCell(cell)) cell.destroy();
  }
  for (const cell of cells) if (cell.parent !== row) row.appendChild(cell);
  layInOrder(row, orderedCells(row, [...cells, ...apart]));
}

/** Lays a parent's children in the order given, moving only those out of place. */
function layInOrder(parent: DataElement, ordered: readonly DataElement[]): void {
  ordered.forEach((child, index) => {
    if (parent.children[index] !== child) {
      const next = parent.children[index] ?? null;
      if (next) parent.insertBefore(child, next);
      else parent.appendChild(child);
    }
  });
}

/**
 * Builds a table as the shape says, for the table builder and the table's own edit alike: rows and
 * columns kept, named again, moved, made and taken away, every value of a kept row and column left as
 * it was and carried into a column's new kind as far as it reads as one. A new row holds a cell of
 * every column, holding nothing. The rows and cells that hold the gaps of a skill table, which the
 * table's settings own, are left where they are. The table is shown as a table.
 */
export function applyTableShape(table: DataElement, shape: TableShape): void {
  GameObject.batch(() => {
    if (table.viewMode !== DataElementViewMode.TABLE) table.setViewMode(DataElementViewMode.TABLE);
    const before = tableShapeOf(table).columns;
    const changes = shape.columns.map((column) =>
      changeOf(column, column.from !== null ? before.find((each) => each.from === column.from) : undefined)
    );
    const standing = getTableBodyRows(table);
    const controls = table.children.filter((child) => isTableControlRow(child));
    const rows = shape.rows.map((wanted) => {
      const row =
        standing.find((each) => each.identifier === wanted.from) ??
        DataElement.create(wanted.name.trim(), '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
      if (row.name !== wanted.name.trim()) row.name = wanted.name.trim();
      fitRow(row, shape, changes, true);
      return row;
    });
    const apart = standing.filter((row) => !rows.includes(row) && !dropsRow(shape, row));
    for (const row of apart) fitRow(row, shape, changes, true);
    for (const control of controls) fitRow(control, shape, changes, false);
    for (const row of standing) if (!rows.includes(row) && !apart.includes(row)) row.destroy();
    for (const row of rows) if (row.parent !== table) table.appendChild(row);
    const body = [...rows, ...apart];
    const controlsFirst = controls.length > 0 && table.children.indexOf(controls[0]) === 0;
    layInOrder(table, controlsFirst ? [...controls, ...body] : [...body, ...controls]);
  });
}

/** Makes a table of the shape given, under a name, shown as a table, to be put where tables go. */
export function createShapedTable(name: string, shape: TableShape): DataElement {
  const table = DataElement.create(name, '', {
    [DataElementAttribute.ROLE]: DataElementRole.GROUP,
    [DataElementAttribute.VIEW_MODE]: DataElementViewMode.TABLE,
  });
  applyTableShape(table, shape);
  return table;
}
