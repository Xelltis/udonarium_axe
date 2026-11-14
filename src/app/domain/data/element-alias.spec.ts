import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import {
  aliasMatesOf,
  type ElementAliasTable,
  elementReferredTo,
  elementsReferredTo,
  readElementAliases,
  watchedLeafNames,
  writeElementAliases,
} from '@axe/domain/data/element-alias';

function resource(name: string, max: number, current: number): DataElement {
  return DataElement.create(name, max, { type: DataElementType.NUMBER_RESOURCE, currentValue: String(current) });
}

/** A sheet with 行動値 twice, once under リソース/基本 and once under 戦闘/基本. */
function twoSpeedSheet(): { detail: DataElement; first: DataElement; second: DataElement } {
  const detail = DataElement.create('detail', '');
  const first = resource('行動値', 20, 10);
  const second = resource('行動値', 20, 12);
  for (const [section, element] of [
    ['リソース', first],
    ['戦闘', second],
  ] as const) {
    const top = DataElement.create(section, '');
    const group = DataElement.create('基本', '');
    detail.appendChild(top);
    top.appendChild(group);
    group.appendChild(element);
  }
  return { detail, first, second };
}

const SPEED: ElementAliasTable = [
  { name: '行動値', candidates: ['リソース/基本/行動値', '戦闘/基本/行動値', 'イニシアティブ'] },
];

describe('element aliases', () => {
  describe('reading a reference', () => {
    it('takes the first candidate that names one item', () => {
      const { detail, first } = twoSpeedSheet();

      expect(elementReferredTo(detail, '行動値', SPEED)).toBe(first);
    });

    it('follows the order of the candidates', () => {
      const { detail, second } = twoSpeedSheet();
      const swapped = [{ name: '行動値', candidates: ['戦闘/基本/行動値', 'リソース/基本/行動値'] }];

      expect(elementReferredTo(detail, '行動値', swapped)).toBe(second);
    });

    it('finds a later candidate on a sheet that has none of the earlier ones', () => {
      const detail = DataElement.create('detail', '');
      const initiative = DataElement.create('イニシアティブ', 7);
      detail.appendChild(initiative);

      expect(elementReferredTo(detail, '行動値', SPEED)).toBe(initiative);
    });

    it('passes over a bare name several items answer to and goes on to the next candidate', () => {
      const { detail, second } = twoSpeedSheet();
      const bareFirst = [{ name: '速さ', candidates: ['行動値', '戦闘/基本/行動値'] }];

      expect(elementReferredTo(detail, '速さ', bareFirst)).toBe(second);
    });

    it('comes before an item of the same name', () => {
      const detail = DataElement.create('detail', '');
      const named = DataElement.create('行動値', 3);
      const initiative = DataElement.create('イニシアティブ', 7);
      detail.appendChild(named);
      detail.appendChild(initiative);
      const aliases = [{ name: '行動値', candidates: ['イニシアティブ'] }];

      expect(elementReferredTo(detail, '行動値', aliases)).toBe(initiative);
    });

    it('stands for nothing where no candidate is on the sheet, the item of the same name included', () => {
      const detail = DataElement.create('detail', '');
      detail.appendChild(DataElement.create('行動値', 3));
      const aliases = [{ name: '行動値', candidates: ['イニシアティブ'] }];

      expect(elementReferredTo(detail, '行動値', aliases)).toBeNull();
      expect(elementsReferredTo(detail, '行動値', aliases)).toEqual([]);
    });

    it('reads a reference that is no alias as it always was', () => {
      const { detail, first } = twoSpeedSheet();

      expect(elementReferredTo(detail, 'リソース/基本/行動値', SPEED)).toBe(first);
      expect(elementReferredTo(detail, '行動値', [])).toBeNull();
    });
  });

  describe('the items a value is written to', () => {
    it('is every candidate found on the sheet, the one read from first', () => {
      const { detail, first, second } = twoSpeedSheet();

      expect(elementsReferredTo(detail, '行動値', SPEED)).toEqual([first, second]);
    });

    it('is the one item of a sheet that carries only one candidate', () => {
      const detail = DataElement.create('detail', '');
      const initiative = DataElement.create('イニシアティブ', 7);
      detail.appendChild(initiative);

      expect(elementsReferredTo(detail, '行動値', SPEED)).toEqual([initiative]);
    });

    it('lists an item two candidates name only once', () => {
      const detail = DataElement.create('detail', '');
      const initiative = DataElement.create('イニシアティブ', 7);
      detail.appendChild(initiative);
      const aliases = [{ name: '行動値', candidates: ['イニシアティブ', 'detail/イニシアティブ'] }];

      expect(elementsReferredTo(detail, '行動値', aliases)).toEqual([initiative]);
    });
  });

  describe('the mates of an item', () => {
    it('are the other items of the sheet under the same alias', () => {
      const { first, second } = twoSpeedSheet();

      expect(aliasMatesOf(first, SPEED)).toEqual([second]);
      expect(aliasMatesOf(second, SPEED)).toEqual([first]);
    });

    it('are none for an item no alias stands for, or in a room without aliases', () => {
      const { detail, first } = twoSpeedSheet();
      const other = DataElement.create('HP', 10);
      detail.appendChild(other);

      expect(aliasMatesOf(other, SPEED)).toEqual([]);
      expect(aliasMatesOf(first, [])).toEqual([]);
    });
  });

  describe('as saved and sent', () => {
    it('comes back as it was written', () => {
      expect(readElementAliases(writeElementAliases(SPEED))).toEqual(SPEED);
    });

    it('writes nothing for no aliases, so a room that never named one saves as it did', () => {
      expect(writeElementAliases([])).toBe('');
    });

    it('reads empty, missing or broken text as no aliases', () => {
      expect(readElementAliases('')).toEqual([]);
      expect(readElementAliases(undefined)).toEqual([]);
      expect(readElementAliases(null)).toEqual([]);
      expect(readElementAliases('[{"name":"行動値"')).toEqual([]);
      expect(readElementAliases('{"name":"行動値","candidates":["a"]}')).toEqual([]);
      expect(readElementAliases('"行動値"')).toEqual([]);
    });

    it('passes over an entry with no name or a blank one, and a candidate that is blank or not text', () => {
      const raw = JSON.stringify([
        { candidates: ['a'] },
        { name: '  ', candidates: ['a'] },
        { name: 7, candidates: ['a'] },
        null,
        { name: ' 行動値 ', candidates: [' a ', '', 3, null, 'a', 'b'] },
        { name: '行動値', candidates: ['later'] },
        { name: '回避', candidates: 'not a list' },
      ]);

      expect(readElementAliases(raw)).toEqual([
        { name: '行動値', candidates: ['a', 'b'] },
        { name: '回避', candidates: [] },
      ]);
    });
  });

  describe('the names a view watches', () => {
    it('adds the last name of each candidate behind an alias', () => {
      expect(watchedLeafNames(['HP', '行動値', 'リソース/MP'], SPEED)).toEqual([
        'HP',
        '行動値',
        'イニシアティブ',
        'MP',
      ]);
    });
  });
});
