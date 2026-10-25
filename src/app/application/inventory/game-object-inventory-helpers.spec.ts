import { sortObjectsByKeys, toSortableValue } from '@axe/application/inventory/game-object-inventory-helpers';
import { DataElement } from '@axe/domain/data/data-element';
import { SortOrder } from '@axe/domain/data/data-summary-setting';

function createObject(name: string, hp: string | number, dex: string | number) {
  const rootDataElement = DataElement.create('character', '');
  const detail = DataElement.create('detail', '');
  const resource = DataElement.create('リソース', '');
  const ability = DataElement.create('能力', '');
  rootDataElement.appendChild(detail);
  detail.appendChild(resource);
  detail.appendChild(ability);
  resource.appendChild(DataElement.create('HP', hp));
  ability.appendChild(DataElement.create('DEX', dex));

  return {
    identifier: name,
    rootDataElement,
  };
}

function createElement(value: string | number) {
  const isNumber = typeof value === 'number';
  return {
    isNumberResource: isNumber,
    currentValue: isNumber ? value : 0,
    value: isNumber ? String(value) : value,
  };
}

describe('game-object-inventory-helpers', () => {
  describe('toSortableValue', () => {
    it('turns a numeric string into a number', () => {
      expect(toSortableValue(createElement('１２３') as never)).toBe(123);
    });

    it('leaves a non-numeric string alone', () => {
      expect(toSortableValue(createElement('abc') as never)).toBe('abc');
    });
  });

  describe('sortObjectsByKeys', () => {
    it('leaves the order alone with no sort tag', () => {
      const a = createObject('a', 20, 5);
      const b = createObject('b', 10, 8);
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: '', order: SortOrder.ASC },
        { tag: 'DEX', order: SortOrder.ASC },
      ]);
      expect(result).toEqual([a, b]);
    });

    it('sorts ascending by the first key', () => {
      const a = createObject('a', 20, 5);
      const b = createObject('b', 10, 8);
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: 'HP', order: SortOrder.ASC },
        { tag: 'DEX', order: SortOrder.ASC },
      ]);
      expect(result.map((x) => x.identifier)).toEqual(['b', 'a']);
    });

    it('sorts descending by the second key when the first ties', () => {
      const a = createObject('a', 10, 5);
      const b = createObject('b', 10, 8);
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: 'HP', order: SortOrder.ASC },
        { tag: 'DEX', order: SortOrder.DESC },
      ]);
      expect(result.map((x) => x.identifier)).toEqual(['b', 'a']);
    });

    it('reads a third step where the first two leave pieces level', () => {
      const a = createObject('a', 10, 5);
      const b = createObject('b', 10, 5);
      b.rootDataElement.getFirstElementByName('能力')!.appendChild(DataElement.create('MP', 1));
      a.rootDataElement.getFirstElementByName('能力')!.appendChild(DataElement.create('MP', 9));
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: 'HP', order: SortOrder.ASC },
        { tag: 'DEX', order: SortOrder.ASC },
        { tag: 'MP', order: SortOrder.ASC },
      ]);
      expect(result.map((x) => x.identifier)).toEqual(['b', 'a']);
    });

    it('passes over a step with no name and reads the one after it', () => {
      const a = createObject('a', 10, 5);
      const b = createObject('b', 10, 8);
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: 'HP', order: SortOrder.ASC },
        { tag: ' ', order: SortOrder.ASC },
        { tag: 'DEX', order: SortOrder.DESC },
      ]);
      expect(result.map((x) => x.identifier)).toEqual(['b', 'a']);
    });

    it('reads the next step where neither piece carries a step', () => {
      const a = createObject('a', 10, 5);
      const b = createObject('b', 10, 8);
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: '幸運', order: SortOrder.ASC },
        { tag: 'DEX', order: SortOrder.DESC },
      ]);
      expect(result.map((x) => x.identifier)).toEqual(['b', 'a']);
    });

    it('leaves two pieces level where neither carries a later step', () => {
      const a = createObject('a', 10, 5);
      const b = createObject('b', 10, 5);
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: 'HP', order: SortOrder.ASC },
        { tag: 'DEX', order: SortOrder.ASC },
        { tag: '幸運', order: SortOrder.DESC },
      ]);
      expect(result.map((x) => x.identifier)).toEqual(['a', 'b']);
    });

    it('sorts by a tag named with a path', () => {
      const a = createObject('a', 20, 5);
      const b = createObject('b', 10, 8);
      const result = sortObjectsByKeys([a, b] as never[], [
        { tag: 'リソース/HP', order: SortOrder.ASC },
        { tag: '', order: SortOrder.ASC },
      ]);
      expect(result.map((x) => x.identifier)).toEqual(['b', 'a']);
    });
  });
});
