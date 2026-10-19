import { DataElementAttribute, DataElementRole, DataElementViewMode } from '@axe/domain/data/data-element';
import { createSkillGapTableElement } from '@axe/domain/data/skill-gap-table';

describe('createSkillGapTableElement', () => {
  beforeEach(() => {});

  const categories = ['器術', '体術', '忍術', '謀術', '戦術', '妖術'];
  const skillsByCategory = categories.map((category) => Array.from({ length: 11 }, (_, r) => `${category}${r + 2}`));

  it('builds the section as a table two columns wide', () => {
    const table = createSkillGapTableElement({ name: '特技表', categories, skillsByCategory });
    expect(table.fieldRole).toBe(DataElementRole.SECTION);
    expect(table.viewMode).toBe(DataElementViewMode.TABLE);
    expect(table.getAttribute('cs-colspan')).toBe('2');
    // the gap row and eleven others
    expect(table.children).toHaveLength(12);
  });

  it('the gap row holds the wrapping gap, the six headings and the five gaps between them', () => {
    const table = createSkillGapTableElement({ name: '特技表', categories, skillsByCategory });
    const gapRow = table.children.find((child) => child.name === 'ギャップ')!;
    expect(gapRow.fieldRole).toBe(DataElementRole.GROUP);
    expect(gapRow.children.map((child) => child.name)).toEqual([
      'ギャップ6',
      '器術',
      'ギャップ1',
      '体術',
      'ギャップ2',
      '忍術',
      'ギャップ3',
      '謀術',
      'ギャップ4',
      '戦術',
      'ギャップ5',
      '妖術',
    ]);
    const wrap = gapRow.getFirstElementByName('ギャップ6')!;
    expect(wrap.getAttribute(DataElementAttribute.CELL_KIND)).toBe('gap');
    expect(wrap.getAttribute(DataElementAttribute.CELL_TEXT)).toBe('妖術-器術');
    expect(gapRow.getFirstElementByName('ギャップ1')!.getAttribute(DataElementAttribute.CELL_TEXT)).toBe('器術-体術');
  });

  it('takes what was learnt and where the gaps fall', () => {
    const checked = categories.map((_, c) => Array.from({ length: 11 }, (__, r) => c === 0 && r === 0));
    const gaps = [false, true, false, false, false, false]; // ギャップ2, between 体術 and 忍術
    const table = createSkillGapTableElement({ name: '特技表', categories, skillsByCategory, checked, gaps });

    const row2 = table.children.find((child) => child.name === '2')!;
    expect(row2.getFirstElementByName('器術')!.value).toBe(1);
    expect(row2.getFirstElementByName('体術')!.value).toBe(0);
    expect(row2.getFirstElementByName('器術')!.getAttribute(DataElementAttribute.CELL_TEXT)).toBe('器術2');

    const gapRow = table.children.find((child) => child.name === 'ギャップ')!;
    expect(gapRow.getFirstElementByName('ギャップ2')!.value).toBe(1);
    expect(gapRow.getFirstElementByName('ギャップ1')!.value).toBe(0);
  });
});
