import { TestBed } from '@angular/core/testing';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import {
  buildTableColumnHeaderGroups,
  findGapCellInColumn,
  getCellLabel,
  getCellUnit,
  getSelectOptions,
  isCheckCellChecked,
  isGapColumn,
  isSelectValueListed,
  nextCheckCellValue,
  type TableColumn,
} from '@axe/domain/data/table-layout';

function makeCell(name: string, value: string | number = ''): DataElement {
  const cell = DataElement.create(name, value);
  cell.setAttribute(DataElementAttribute.ROLE, 'field');
  return cell;
}

function makeColumn(name: string, kind: string = ''): TableColumn {
  return { name, label: name, group: '', kind };
}

describe('table-layout cell helpers', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('isGapColumn()', () => {
    it('is true for a gap and nothing else', () => {
      expect(isGapColumn(makeColumn('hp', 'gap'))).toBe(true);
      expect(isGapColumn(makeColumn('hp', ''))).toBe(false);
      expect(isGapColumn(makeColumn('hp', 'check'))).toBe(false);
    });
  });

  describe('isCheckCellChecked()', () => {
    it.each(['1', 'true', 'x', 'checked', 'TRUE', 'X', 'Checked'])('reads it as ticked', (value) => {
      const cell = makeCell('chk', value);
      expect(isCheckCellChecked(cell)).toBe(true);
    });
    it.each(['', '0', 'false', 'no', '2'])('reads it as unticked', (value) => {
      const cell = makeCell('chk', value);
      expect(isCheckCellChecked(cell)).toBe(false);
    });
  });

  describe('nextCheckCellValue()', () => {
    it('takes the value from the event where there is one', () => {
      const cell = makeCell('chk', '1');
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = false;
      const ev = new Event('change');
      Object.defineProperty(ev, 'target', { value: inp });
      expect(nextCheckCellValue(cell, ev)).toBe(0);

      inp.checked = true;
      expect(nextCheckCellValue(cell, ev)).toBe(1);
    });

    it('flips the current value where there is not', () => {
      expect(nextCheckCellValue(makeCell('chk', '1'))).toBe(0);
      expect(nextCheckCellValue(makeCell('chk', ''))).toBe(1);
    });
  });

  describe('getCellLabel()', () => {
    it('returns the text of the cell, trimmed', () => {
      const cell = makeCell('chk');
      cell.setAttribute(DataElementAttribute.CELL_TEXT, '  習得済み  ');
      expect(getCellLabel(cell)).toBe('習得済み');
    });
    it('returns nothing when it carries none', () => {
      expect(getCellLabel(makeCell('chk'))).toBe('');
    });
  });

  describe('getCellUnit()', () => {
    it('returns the unit with a space before it', () => {
      const cell = makeCell('hp');
      cell.setAttribute(DataElementAttribute.UNIT, '点');
      expect(getCellUnit(cell)).toBe(' 点');
    });
    it('returns nothing, and no space, when there is none', () => {
      expect(getCellUnit(makeCell('hp'))).toBe('');
    });
  });

  describe('getSelectOptions() / isSelectValueListed()', () => {
    it('reads the options off the attribute', () => {
      const cell = makeCell('sel', 'B');
      cell.setAttribute(DataElementAttribute.CHOICES, 'A,B,C');
      expect(getSelectOptions(cell)).toEqual(['A', 'B', 'C']);
      expect(isSelectValueListed(cell)).toBe(true);
    });
    it('is false when the current value is not among them', () => {
      const cell = makeCell('sel', 'Z');
      cell.setAttribute(DataElementAttribute.CHOICES, 'A,B,C');
      expect(isSelectValueListed(cell)).toBe(false);
    });
  });

  describe('findGapCellInColumn()', () => {
    it('finds the gap cell of a column in the first row', () => {
      // two rows, each with a gap cell
      const parent = DataElement.create('table', '');
      const row1 = DataElement.create('row1', '');
      const row2 = DataElement.create('row2', '');
      parent.appendChild(row1);
      parent.appendChild(row2);

      const gap1 = makeCell('mark', '');
      gap1.setAttribute(DataElementAttribute.CELL_KIND, 'gap');
      row1.appendChild(gap1);

      const gap2 = makeCell('mark', '');
      gap2.setAttribute(DataElementAttribute.CELL_KIND, 'gap');
      row2.appendChild(gap2);

      const found = findGapCellInColumn(parent, makeColumn('mark', 'gap'));
      expect(found).toBe(gap1);
    });

    it('returns nothing for any column but a gap', () => {
      const parent = DataElement.create('table', '');
      expect(findGapCellInColumn(parent, makeColumn('mark', ''))).toBeNull();
    });
  });

  describe('buildTableColumnHeaderGroups()', () => {
    it('spans a run of columns that share a group or a label', () => {
      const cols: TableColumn[] = [
        { name: 'a', label: 'A', group: 'G1', kind: '' },
        { name: 'b', label: 'B', group: 'G1', kind: '' },
        { name: 'c', label: 'C', group: 'G2', kind: '' },
      ];
      const groups = buildTableColumnHeaderGroups(cols);
      expect(groups).toEqual([
        { key: '0:G1', label: 'G1', span: 2 },
        { key: '2:G2', label: 'G2', span: 1 },
      ]);
    });

    it('keys a column with no group by its label', () => {
      const cols: TableColumn[] = [
        { name: 'a', label: 'Same', group: '', kind: '' },
        { name: 'b', label: 'Same', group: '', kind: '' },
      ];
      const groups = buildTableColumnHeaderGroups(cols);
      expect(groups).toEqual([{ key: '0:Same', label: 'Same', span: 2 }]);
    });
  });
});
