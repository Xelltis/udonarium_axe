import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { findJudgementCandidates } from '@axe/domain/data/skill-table-judgement';

/** A helper that builds a check cell for the tests. */
function makeCheckCell(name: string, checked: boolean, label = ''): DataElement {
  const cell = DataElement.create(name, checked ? 1 : 0, {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
    [DataElementAttribute.CELL_TEXT]: label,
  });
  return cell;
}

/** A helper that builds a row. */
function makeRow(name: string, cells: DataElement[]): DataElement {
  const row = DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  for (const cell of cells) row.appendChild(cell);
  return row;
}

const isChecked = (cell: DataElement): boolean => {
  const v = String(cell.value).trim().toLowerCase();
  return v === '1' || v === 'true';
};

/**
 * The table the tests work against:
 *   three columns,
 *   four rows,
 *   and three cells learnt.
 */
function buildTestTable(): { rows: DataElement[]; columns: { name: string; label: string }[] } {
  const columns = [
    { name: 'A', label: 'A技能' },
    { name: 'B', label: 'B技能' },
    { name: 'C', label: 'C技能' },
  ];

  const row0 = makeRow('行0', [
    makeCheckCell('A', true, 'A技能名'),
    makeCheckCell('B', false, 'B技能名'),
    makeCheckCell('C', false, 'C技能名'),
  ]);
  const row1 = makeRow('行1', [
    makeCheckCell('A', false, 'A技能名'),
    makeCheckCell('B', false, 'B技能名'),
    makeCheckCell('C', true, 'C技能名'),
  ]);
  const row2 = makeRow('行2', [
    makeCheckCell('A', false, 'A技能名'),
    makeCheckCell('B', false, 'B技能名'),
    makeCheckCell('C', false, 'C技能名'),
  ]);
  const row3 = makeRow('行3', [
    makeCheckCell('A', false, 'A技能名'),
    makeCheckCell('B', true, 'B技能名'),
    makeCheckCell('C', false, 'C技能名'),
  ]);

  return { rows: [row0, row1, row2, row3], columns };
}

describe('findJudgementCandidates', () => {
  it('returns the learnt skills nearest the cell pressed first', () => {
    const { rows, columns } = buildTestTable();

    // one press, and the three learnt cells at increasing distances
    const result = findJudgementCandidates(rows, columns, 1, 0, isChecked);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ rowName: '行0', colName: 'A', distance: 1 });
    expect(result[1]).toMatchObject({ rowName: '行1', colName: 'C', distance: 2 });
    expect(result[2]).toMatchObject({ rowName: '行3', colName: 'B', distance: 3 });
  });

  it('puts the pressed cell itself at the front when it was learnt', () => {
    const { rows, columns } = buildTestTable();

    const result = findJudgementCandidates(rows, columns, 0, 0, isChecked);

    expect(result[0]).toMatchObject({ rowName: '行0', colName: 'A', distance: 0 });
  });

  it('returns nothing when none was', () => {
    const columns = [{ name: 'A', label: 'A' }];
    const row = makeRow('行0', [makeCheckCell('A', false)]);

    const result = findJudgementCandidates([row], columns, 0, 0, isChecked);

    expect(result).toHaveLength(0);
  });

  it('returns no more candidates than it is allowed', () => {
    const columns = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, label: `C${i}` }));
    const cells = columns.map((col) => makeCheckCell(col.name, true));
    const row = makeRow('行0', cells);

    const result = findJudgementCandidates([row], columns, 0, 0, isChecked);

    expect(result).toHaveLength(5);
  });

  it('takes any limit it is given', () => {
    const { rows, columns } = buildTestTable();

    const result = findJudgementCandidates(rows, columns, 0, 0, isChecked, 2);

    expect(result).toHaveLength(2);
  });

  it('carries the text of the cell in its label', () => {
    const { rows, columns } = buildTestTable();

    const result = findJudgementCandidates(rows, columns, 0, 0, isChecked);

    expect(result[0].cellLabel).toBe('A技能名');
  });

  it('leaves that label empty for a cell with no text', () => {
    const columns = [{ name: 'A', label: 'A技能' }];
    const row = makeRow('行0', [makeCheckCell('A', true)]);

    const result = findJudgementCandidates([row], columns, 0, 0, isChecked);

    expect(result[0].cellLabel).toBe('');
  });

  it('measures across the rows too', () => {
    const { rows, columns } = buildTestTable();

    // one press, and the learnt cells at their distances from it
    const result = findJudgementCandidates(rows, columns, 0, 2, isChecked);

    expect(result[0]).toMatchObject({ rowName: '行1', colName: 'C', distance: 1 });
    expect(result[1]).toMatchObject({ rowName: '行0', colName: 'A', distance: 2 });
    expect(result[2]).toMatchObject({ rowName: '行3', colName: 'B', distance: 4 });
  });

  describe('counting the gaps into the distance', () => {
    it('adds the cost of a gap that lies on the way', () => {
      const { rows, columns } = buildTestTable();
      // a gap between the first two columns
      const gapCostsBetweenCols = [2, 0];

      // one press, whose distance is the step plus that gap
      const result = findJudgementCandidates(rows, columns, 3, 0, isChecked, 5, { gapCostsBetweenCols });

      const bCandidate = result.find((c) => c.colName === 'B' && c.rowName === '行3');
      expect(bCandidate?.distance).toBe(3); // a step of 1 plus a gap of 2
    });

    it('leaves the distance alone for a gap that costs nothing', () => {
      const { rows, columns } = buildTestTable();
      const gapCostsBetweenCols = [0, 0];

      const result = findJudgementCandidates(rows, columns, 3, 0, isChecked, 5, { gapCostsBetweenCols });

      const bCandidate = result.find((c) => c.colName === 'B' && c.rowName === '行3');
      expect(bCandidate?.distance).toBe(1);
    });
  });

  describe('wrapping round', () => {
    it('takes the shorter way round when the rows wrap', () => {
      const { rows, columns } = buildTestTable();
      // two rows, further apart the long way than the short
      const result = findJudgementCandidates(rows, columns, 0, 1, isChecked, 5, { loopVertical: true });

      const bCandidate = result.find((c) => c.colName === 'B' && c.rowName === '行3');
      expect(bCandidate?.distance).toBe(1); // 1 by wrapping round, going down from row 3 on to row 0
    });

    it('takes the shorter way round when the columns wrap', () => {
      // five columns, with the first and the last learnt
      const columns = Array.from({ length: 5 }, (_, i) => ({ name: String.fromCharCode(65 + i), label: `技${i}` }));
      const row = makeRow('行0', [
        makeCheckCell('A', true),
        makeCheckCell('B', false),
        makeCheckCell('C', false),
        makeCheckCell('D', false),
        makeCheckCell('E', true),
      ]);

      // a press in the middle, equally far from each once it wraps
      const result = findJudgementCandidates([row], columns, 0, 2, isChecked, 5, { loopHorizontal: true });
      const aCandidate = result.find((c) => c.colName === 'A');
      const eCandidate = result.find((c) => c.colName === 'E');
      expect(aCandidate?.distance).toBe(2);
      expect(eCandidate?.distance).toBe(2);
    });

    it('takes the other way round when it is nearer', () => {
      // six columns, the first learnt and the last pressed
      // far the long way and one step round
      const columns = Array.from({ length: 6 }, (_, i) => ({ name: String.fromCharCode(65 + i), label: `技${i}` }));
      const row = makeRow('行0', [
        makeCheckCell('A', true),
        ...Array.from({ length: 5 }, (_, i) => makeCheckCell(String.fromCharCode(66 + i), false)),
      ]);

      const result = findJudgementCandidates([row], columns, 0, 5, isChecked, 5, { loopHorizontal: true });
      expect(result[0]).toMatchObject({ colName: 'A', distance: 1 });
    });
  });
});
