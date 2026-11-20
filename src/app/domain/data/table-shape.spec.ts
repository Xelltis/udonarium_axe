import { ObjectStore } from '@axe/core/sync/object-store';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { getTableBodyRows, getTableColumns } from '@axe/domain/data/table-layout';
import {
  applyTableShape,
  canBuildTable,
  cellsLostBy,
  createShapedTable,
  movedAPlace,
  newTableColumn,
  newTableRow,
  type TableShape,
  tableShapeOf,
  tableShapeProblems,
} from '@axe/domain/data/table-shape';

/** A cell of a table as the sheet keeps one. */
function cell(
  name: string,
  value: string | number,
  fieldType: string = DataElementFieldType.TEXT,
  more = {}
): DataElement {
  return DataElement.create(name, value, {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]: fieldType,
    ...more,
  });
}

/** A skill table: a gap row first, then rows 2 and 3, each a check per skill, a text note and a gap cell. */
function skillTable(): DataElement {
  const table = DataElement.create('技能表', '', {
    [DataElementAttribute.ROLE]: DataElementRole.SECTION,
    [DataElementAttribute.VIEW_MODE]: DataElementViewMode.TABLE,
  });
  const gapRow = DataElement.create('gap', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  gapRow.appendChild(cell('技巧', ''));
  gapRow.appendChild(cell('備考', ''));
  gapRow.appendChild(cell('間', '', DataElementFieldType.TEXT, { [DataElementAttribute.CELL_KIND]: 'gap' }));
  table.appendChild(gapRow);
  for (const [name, ticked, note] of [
    ['2', 1, 'メモ2'],
    ['3', 0, 'メモ3'],
  ] as const) {
    const row = DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
    row.appendChild(
      cell('技巧', ticked, DataElementFieldType.CHECK, {
        [DataElementAttribute.COLUMN_LABEL]: '器用',
        [DataElementAttribute.COLUMN_GROUP]: '肉体',
      })
    );
    row.appendChild(cell('間', '', DataElementFieldType.TEXT, { [DataElementAttribute.CELL_KIND]: 'gap' }));
    row.appendChild(cell('備考', note));
    table.appendChild(row);
  }
  return table;
}

/** The table's body as names and values, row by row. */
function body(table: DataElement): unknown[] {
  return getTableBodyRows(table).map((row) => [row.name, ...row.children.map((each) => `${each.name}=${each.value}`)]);
}

describe('table-shape', () => {
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('reads a table as it stands, its gap columns kept aside and the row that holds their settings left out', () => {
    const table = skillTable();

    expect(tableShapeOf(table)).toEqual({
      columns: [
        { name: '技巧', label: '', group: '', kind: 'check', choices: '', from: '技巧' },
        { name: '備考', label: '', group: '', kind: 'text', choices: '', from: '備考' },
      ],
      rows: [
        { name: '2', from: table.children[1].identifier },
        { name: '3', from: table.children[2].identifier },
      ],
      gaps: ['間'],
    });
  });

  it('changes nothing of a table built again as it stands', () => {
    const table = skillTable();
    const everything = [table, ...table.children, ...table.children.flatMap((row) => row.children)];
    const sent = everything.map((element) => vi.spyOn(element, 'update'));

    applyTableShape(table, tableShapeOf(table));

    for (const spy of sent) expect(spy).not.toHaveBeenCalled();
  });

  it('adds, names again, moves and takes away rows and columns, leaving every value it keeps as it was', () => {
    const table = skillTable();
    const [two, three] = tableShapeOf(table).rows;
    const shape: TableShape = {
      columns: [
        { name: '注記', label: '', group: '', kind: 'text', choices: '', from: '備考' },
        { name: '技巧', label: '器用', group: '肉体', kind: 'check', choices: '', from: '技巧' },
        { name: '隠密', label: '', group: '肉体', kind: 'check', choices: '', from: null },
      ],
      rows: [
        { ...three, name: '三' },
        { name: '4', from: null },
      ],
    };

    applyTableShape(table, shape);

    expect(body(table)).toEqual([
      ['三', '注記=メモ3', '技巧=0', '間=', '隠密=0'],
      ['4', '注記=', '技巧=0', '隠密=0'],
    ]);
    expect(table.children[0].name).toBe('gap');
    expect(ObjectStore.instance.get(two.from!)).toBeNull();
  });

  it('carries a value into a column of another kind as far as it reads as one', () => {
    const table = skillTable();
    const shape = tableShapeOf(table);

    applyTableShape(table, {
      ...shape,
      columns: [
        { ...shape.columns[0], kind: 'text' },
        { ...shape.columns[1], kind: 'select', choices: 'メモ2,ほか' },
      ],
    });

    expect(body(table)).toEqual([
      ['2', '技巧=1', '間=', '備考=メモ2'],
      ['3', '技巧=', '間=', '備考=メモ3'],
    ]);
    expect(getTableColumns(table).map((column) => column.name)).toEqual(['技巧', '備考', '間']);
    expect(getTableBodyRows(table)[0].children[2].getAttribute(DataElementAttribute.CHOICES)).toBe('メモ2,ほか');
  });

  it('keeps the row holding the gaps’ settings as it is when a column changes kind', () => {
    const table = skillTable();
    const shape = tableShapeOf(table);

    applyTableShape(table, { ...shape, columns: [shape.columns[0], { ...shape.columns[1], kind: 'check' }] });

    expect(getTableBodyRows(table).map((row) => row.name)).toEqual(['2', '3']);
    expect(table.children[0].children.map((each) => `${each.name}=${each.value}`)).toEqual(['技巧=', '備考=', '間=']);
  });

  it('counts the cells holding something that the rows and columns dropped take with them', () => {
    const table = skillTable();
    const shape = tableShapeOf(table);

    expect(cellsLostBy(table, shape)).toBe(0);
    expect(cellsLostBy(table, { ...shape, columns: [shape.columns[0]] })).toBe(2);
    expect(cellsLostBy(table, { ...shape, rows: [shape.rows[1]] })).toBe(2);
  });

  it('makes a new table of the shape asked for, shown as a table', () => {
    const table = createShapedTable('新しい表', {
      columns: [{ name: 'A', label: '', group: '', kind: 'number', choices: '', from: null }],
      rows: [
        { name: '1', from: null },
        { name: '2', from: null },
      ],
    });

    expect(table.viewMode).toBe(DataElementViewMode.TABLE);
    expect(body(table)).toEqual([
      ['1', 'A='],
      ['2', 'A='],
    ]);
  });

  it('refuses a table with no column or row, a blank name, or two columns of one name', () => {
    const column = { name: 'A', label: '', group: '', kind: 'text', choices: '', from: null } as const;

    expect(tableShapeProblems({ columns: [column], rows: [{ name: '1', from: null }] })).toEqual([]);
    expect(tableShapeProblems({ columns: [], rows: [] })).toEqual(['noColumn', 'noRow']);
    expect(tableShapeProblems({ columns: [column, column], rows: [{ name: ' ', from: null }] })).toEqual([
      'blankName',
      'sameName',
    ]);
    expect(
      tableShapeProblems({
        columns: [column],
        rows: [
          { name: '2', from: null },
          { name: ' 2', from: null },
        ],
      })
    ).toEqual(['sameRowName']);
  });

  it('builds a table only on a group that reads as one already, or holds nothing', () => {
    const group = DataElement.create('能力', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });

    expect(canBuildTable(skillTable())).toBe(true);
    expect(canBuildTable(group)).toBe(true);
    group.appendChild(cell('HP', 10));
    expect(canBuildTable(group)).toBe(false);
    expect(canBuildTable(cell('HP', 10))).toBe(false);
  });

  it('refuses a column taking the name of a gap column the table keeps', () => {
    const table = skillTable();
    const shape = tableShapeOf(table);

    expect(tableShapeProblems({ ...shape, columns: [{ ...shape.columns[0], name: '間' }, shape.columns[1]] })).toEqual([
      'sameName',
    ]);
  });

  it('names a new column apart from every other, gap columns included, and numbers a new row on', () => {
    const shape = tableShapeOf(skillTable());

    expect(newTableColumn(shape, '列')).toMatchObject({ name: '列3', kind: 'check', from: null });
    expect(newTableColumn({ ...shape, gaps: ['列3'] }, '列').name).toBe('列4');
    expect(newTableRow(shape)).toEqual({ name: '4', from: null });
    expect(newTableRow({ columns: [], rows: [{ name: '甲', from: null }] })).toEqual({ name: '2', from: null });
  });

  it('moves a thing a place either way, and leaves a list as it was where it cannot go', () => {
    expect(movedAPlace(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(movedAPlace(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(movedAPlace(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(movedAPlace(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
