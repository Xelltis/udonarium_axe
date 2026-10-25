import { TestBed } from '@angular/core/testing';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { displayItemCandidates } from '@axe/domain/inventory/display-item-candidates';

function sheet(fields: Record<string, string>): DataElement {
  const detail = DataElement.create('detail', '', {});
  const section = DataElement.create('能力', '', {});
  const group = DataElement.create('基本', '', {});
  detail.appendChild(section);
  section.appendChild(group);
  for (const [name, type] of Object.entries(fields)) group.appendChild(DataElement.create(name, 1, { type }));
  return detail;
}

describe('the names offered for the display items', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('are the fields of the sheets, not their sections or groups', () => {
    expect(displayItemCandidates([sheet({ HP: DataElementType.NUMBER_RESOURCE, 敏捷度: '' })])).toEqual([
      'HP',
      '敏捷度',
    ]);
  });

  it('put the names most sheets carry first, keeping the order they were met in among equals', () => {
    const fighter = sheet({ 筋力: '', HP: DataElementType.NUMBER_RESOURCE });
    const mage = sheet({ 知力: '', HP: DataElementType.NUMBER_RESOURCE, MP: DataElementType.NUMBER_RESOURCE });
    const priest = sheet({ 信仰: '', MP: DataElementType.NUMBER_RESOURCE, HP: DataElementType.NUMBER_RESOURCE });

    expect(displayItemCandidates([fighter, mage, priest])).toEqual(['HP', 'MP', '筋力', '知力', '信仰']);
  });

  it('count a name once for a sheet that carries it twice', () => {
    const twice = sheet({ メモ: '' });
    const other = DataElement.create('別', '', {});
    twice.appendChild(other);
    const group = DataElement.create('基本', '', {});
    other.appendChild(group);
    group.appendChild(DataElement.create('メモ', '', {}));

    expect(displayItemCandidates([twice, sheet({ HP: '' })])).toEqual(['メモ', 'HP']);
  });

  it('leave out what a row draws nothing for, and names the line cannot hold', () => {
    const odd = sheet({
      説明: DataElementType.MARKDOWN,
      立ち絵: DataElementType.IMAGE,
      '/': '',
      '"渾名"': '',
      '能力\\補正': '',
      HP: DataElementType.NUMBER_RESOURCE,
    });

    expect(displayItemCandidates([odd])).toEqual(['HP']);
  });

  it('are none where there is no sheet', () => {
    expect(displayItemCandidates([])).toEqual([]);
    expect(displayItemCandidates([null])).toEqual([]);
  });
});
