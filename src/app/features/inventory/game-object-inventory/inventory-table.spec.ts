import { newStatusAilment, parseStatusAilments } from '@axe/domain/character/status-ailment';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementType,
} from '@axe/domain/data/data-element';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { buildInventoryTable } from '@axe/features/inventory/game-object-inventory/inventory-table';

describe('buildInventoryTable()', () => {
  const created: DataElement[] = [];
  const NEW_LINE = '/';

  function field(name: string, type: string = DataElementType.TEXT): DataElement {
    const element = DataElement.create(name, 1, { type });
    created.push(element);
    return element;
  }

  function calcField(name: string): DataElement {
    const element = DataElement.create(name, '1+1');
    element.setAttribute(DataElementAttribute.FIELD_TYPE, DataElementFieldType.CALC);
    created.push(element);
    return element;
  }

  function piece(name: string): TabletopObject {
    return { identifier: name, name } as unknown as TabletopObject;
  }

  function pieceWith(name: string, tag: string, value: number): TabletopObject {
    const root = DataElement.create(name);
    created.push(root);
    const element = DataElement.create(tag, value);
    created.push(element);
    root.appendChild(element);
    return { identifier: name, name, rootDataElement: root } as unknown as TabletopObject;
  }

  afterEach(() => {
    for (const element of created.splice(0)) element.destroy();
  });

  it('makes a column of each display item and a row of each piece', () => {
    const hp = field('HP', DataElementType.NUMBER_RESOURCE);
    const table = buildInventoryTable([piece('ゴブリン')], ['HP'], [], () => [hp], NEW_LINE, '');

    expect(table.columns.map((column) => column.name)).toEqual(['HP']);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cells[0]).toEqual({ element: hp, kind: 'numberResource' });
  });

  it('drops the line breaks, which a table has no line to break', () => {
    const hp = field('HP', DataElementType.NUMBER_RESOURCE);
    const memo = field('メモ');
    const table = buildInventoryTable(
      [piece('ゴブリン')],
      ['HP', NEW_LINE, 'メモ'],
      [],
      () => [hp, null, memo],
      NEW_LINE,
      ''
    );

    expect(table.columns.map((column) => column.name)).toEqual(['HP', 'メモ']);
    expect(table.rows[0].cells.map((cell) => cell.element)).toEqual([hp, memo]);
  });

  it('leaves a piece with none of an item an empty cell, not a shifted one', () => {
    const mp = field('MP', DataElementType.NUMBER_RESOURCE);
    const table = buildInventoryTable([piece('ゴブリン')], ['HP', 'MP'], [], () => [null, mp], NEW_LINE, '');

    expect(table.rows[0].cells[0]).toEqual({ element: null, kind: 'none' });
    expect(table.rows[0].cells[1].element).toBe(mp);
  });

  it('tells the kinds of cell apart', () => {
    const resource = field('HP', DataElementType.NUMBER_RESOURCE);
    const check = field('気絶', DataElementType.CHECK);
    const calc = calcField('合計');
    const plain = field('メモ');
    const table = buildInventoryTable(
      [piece('ゴブリン')],
      ['HP', '気絶', '合計', 'メモ'],
      [],
      () => [resource, check, calc, plain],
      NEW_LINE,
      ''
    );

    expect(table.rows[0].cells.map((cell) => cell.kind)).toEqual(['numberResource', 'check', 'calc', 'value']);
  });

  it('makes a state the room registered a state column', () => {
    const ailments = parseStatusAilments('毒 color:green');
    const table = buildInventoryTable([piece('ゴブリン')], ['毒'], ailments, () => [null], NEW_LINE, '');

    expect(table.columns[0].ailment?.color).toBe('green');
    expect(table.rows[0].cells[0]).toEqual({ element: null, kind: 'ailment' });
  });

  it('lets a registered state win over an item of the same name', () => {
    // The reader put the name in the display items on purpose, and a state can be ticked onto
    // a piece that has nothing of its own for it.
    const sheetPoison = field('毒', DataElementType.CHECK);
    const table = buildInventoryTable(
      [piece('ゴブリン')],
      ['毒'],
      [newStatusAilment('毒')],
      () => [sheetPoison],
      NEW_LINE,
      ''
    );

    expect(table.rows[0].cells[0].kind).toBe('ailment');
  });

  it('reads nothing out of no display items', () => {
    const table = buildInventoryTable([piece('ゴブリン')], [], [], () => [], NEW_LINE, '');

    expect(table.columns).toEqual([]);
    expect(table.rows[0].cells).toEqual([]);
  });

  it('numbers the rows from one, in the order they were handed over', () => {
    const table = buildInventoryTable(
      [pieceWith('騎士', '敏捷度', 32), pieceWith('斥候', '敏捷度', 22), pieceWith('ゴブリン', '敏捷度', 6)],
      [],
      [],
      () => [],
      NEW_LINE,
      '敏捷度'
    );

    expect(table.rows.map((row) => row.order)).toEqual([1, 2, 3]);
  });

  it('gives two pieces of the same speed the same number, and the next one the number after', () => {
    const table = buildInventoryTable(
      [
        pieceWith('騎士', '敏捷度', 32),
        pieceWith('斥候', '敏捷度', 22),
        pieceWith('ゴブリン', '敏捷度', 22),
        pieceWith('ゴーレム', '敏捷度', 6),
      ],
      [],
      [],
      () => [],
      NEW_LINE,
      '敏捷度'
    );

    expect(table.rows.map((row) => row.order)).toEqual([1, 2, 2, 3]);
  });

  it('numbers them one apiece when the list is in no order at all', () => {
    const table = buildInventoryTable([piece('ゴブリン'), piece('オーク')], [], [], () => [], NEW_LINE, '');

    expect(table.rows.map((row) => row.order)).toEqual([1, 2]);
  });

  it('gives every row the same number of cells as there are columns', () => {
    const hp = field('HP', DataElementType.NUMBER_RESOURCE);
    const table = buildInventoryTable(
      [piece('ゴブリン'), piece('オーク')],
      ['HP', NEW_LINE, '毒'],
      [newStatusAilment('毒')],
      (object) => (object.name === 'ゴブリン' ? [hp, null, null] : []),
      NEW_LINE,
      ''
    );

    for (const row of table.rows) expect(row.cells).toHaveLength(table.columns.length);
  });
});
