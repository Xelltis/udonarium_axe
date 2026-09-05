import { matchesSearchText } from '@axe/core/util/text-search';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  bandRowsBySide,
  buildInventoryRow,
  filterInventoryRows,
  filterInventoryRowsByHidden,
  type InventoryRow,
  inventorySearchText,
} from '@axe/features/inventory/game-object-inventory/inventory-list';

let counter = 0;

function makeRow(name = 'ゴブリン', folderName = ''): InventoryRow {
  counter += 1;
  return buildInventoryRow({ identifier: `object-${counter}`, name } as TabletopObject, folderName);
}

function textOf(row: InventoryRow, ownerName = '', elementTexts: readonly string[] = []): string {
  return inventorySearchText(row, ownerName, elementTexts);
}

describe('buildInventoryRow()', () => {
  it('takes its identifier from the object', () => {
    const object = { identifier: 'abc', name: 'ゴブリン' } as TabletopObject;

    expect(buildInventoryRow(object, '').identifier).toBe('abc');
  });

  it('normalizes the folder it was given', () => {
    expect(makeRow('ゴブリン', ' 第1話 // 洞窟 ').folderPath).toBe('第1話/洞窟');
  });
});

describe('inventorySearchText()', () => {
  it('gathers the name, the owner and the folder', () => {
    const text = textOf(makeRow('ゴブリン', '第1話'), '田中');

    expect(matchesSearchText(text, ['ゴブリン'])).toBe(true);
    expect(matchesSearchText(text, ['田中'])).toBe(true);
    expect(matchesSearchText(text, ['第1話'])).toBe(true);
  });

  it('gathers the values it is handed', () => {
    expect(matchesSearchText(textOf(makeRow(), '', ['毒']), ['毒'])).toBe(true);
  });

  it('holds only the name and the owner when it is handed no values', () => {
    expect(textOf(makeRow('ゴブリン'), '田中')).toBe('ゴブリン 田中');
  });
});

describe('filterInventoryRows()', () => {
  it('keeps every row when nothing is searched for', () => {
    const rows = [makeRow('ゴブリン'), makeRow('村長')];

    expect(filterInventoryRows(rows, [], (row) => textOf(row))).toHaveLength(2);
  });

  it('never asks for the text of a row when nothing is searched for', () => {
    const searchTextOf = vi.fn((row: InventoryRow) => textOf(row));

    filterInventoryRows([makeRow(), makeRow()], [], searchTextOf);

    expect(searchTextOf).not.toHaveBeenCalled();
  });

  it('keeps only what matches', () => {
    const rows = [makeRow('ゴブリン'), makeRow('村長')];

    expect(filterInventoryRows(rows, ['村長'], (row) => textOf(row)).map((row) => row.object.name)).toEqual(['村長']);
  });

  it('hands back a list of its own rather than the one it was given', () => {
    const rows = [makeRow()];

    expect(filterInventoryRows(rows, [], (row) => textOf(row))).not.toBe(rows);
  });
});

describe('filterInventoryRowsByHidden()', () => {
  const shown = makeRow('村長');
  const hidden = makeRow('伏せた敵');
  const rows = [shown, hidden];
  const isHidden = (row: InventoryRow) => row === hidden;

  it('keeps every row when nothing is filtered out', () => {
    expect(filterInventoryRowsByHidden(rows, 'all', isHidden)).toHaveLength(2);
  });

  it('hands back a list of its own rather than the one it was given', () => {
    expect(filterInventoryRowsByHidden(rows, 'all', isHidden)).not.toBe(rows);
  });

  it('keeps only what the inventory hides', () => {
    expect(filterInventoryRowsByHidden(rows, 'only', isHidden)).toEqual([hidden]);
  });

  it('drops what the inventory hides', () => {
    expect(filterInventoryRowsByHidden(rows, 'exclude', isHidden)).toEqual([shown]);
  });
});

describe('bandRowsBySide()', () => {
  const sides = [
    { side: 'heroes', name: '味方', color: '#00f', members: [{ identifier: 'a' }, { identifier: 'c' }] },
    { side: 'monsters', name: '敵', color: '#f00', members: [{ identifier: 'b' }] },
  ];

  function row(identifier: string) {
    return { identifier };
  }

  it('gathers the rows under their sides, in the order the sides are taken', () => {
    const bands = bandRowsBySide([row('b'), row('a'), row('c')], sides, (held) => held.identifier);

    expect(bands.map((band) => band.side)).toEqual(['heroes', 'monsters']);
    expect(bands[0].rows.map((held) => held.identifier)).toEqual(['a', 'c']);
    expect(bands[1].rows.map((held) => held.identifier)).toEqual(['b']);
  });

  it('keeps the order the rows came in within a side', () => {
    const bands = bandRowsBySide([row('c'), row('a')], sides, (held) => held.identifier);

    expect(bands[0].rows.map((held) => held.identifier)).toEqual(['c', 'a']);
  });

  it('puts a row on no side last, under no name', () => {
    const bands = bandRowsBySide([row('z'), row('a')], sides, (held) => held.identifier);

    expect(bands.map((band) => band.side)).toEqual(['heroes', '']);
    expect(bands[1].rows.map((held) => held.identifier)).toEqual(['z']);
  });

  it('leaves no heading behind for a side nobody is listed under', () => {
    const bands = bandRowsBySide([row('b')], sides, (held) => held.identifier);

    expect(bands.map((band) => band.side)).toEqual(['monsters']);
  });

  it('answers with nothing at all where there is nothing to gather', () => {
    expect(bandRowsBySide([], sides, (held: { identifier: string }) => held.identifier)).toEqual([]);
  });
});
