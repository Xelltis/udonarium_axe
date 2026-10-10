import { derivedItemNames, displayItemNames, tableItemNames } from '@axe/application/inventory/summary-items';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementRole, DataElementType } from '@axe/domain/data/data-element';

describe('what to show of everybody', () => {
  const created: GameCharacter[] = [];

  function makeCharacter(name = 'コマ'): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    created.push(character);
    return character;
  }

  function addResource(character: GameCharacter, name: string, onPiece = false): DataElement {
    const field = DataElement.create(name, 10, {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      type: DataElementType.NUMBER_RESOURCE,
      currentValue: 10,
      ...(onPiece ? { [DataElementAttribute.PIECE_GAUGE]: 'true' } : {}),
    });
    character.detailDataElement!.appendChild(field);
    return field;
  }

  afterEach(() => {
    for (const character of created.splice(0)) character.destroy();
  });

  describe('working it out from the pieces', () => {
    it('leads with what a sheet marks to show on its piece, ahead of what more pieces share', () => {
      // Somebody chose to watch that one, which outweighs a number the rest happen to carry.
      const first = makeCharacter('A');
      const second = makeCharacter('B');
      const third = makeCharacter('C');
      addResource(first, '正気度', true);
      addResource(first, '弾薬');
      addResource(second, '弾薬');
      addResource(third, '弾薬');

      const names = derivedItemNames([first, second, third]);

      expect(names.indexOf('正気度')).toBeLessThan(names.indexOf('弾薬'));
    });

    it('leads with the pools the sample sheet marks, without anybody saying so', () => {
      const character = makeCharacter();

      expect(derivedItemNames([character]).slice(0, 2)).toEqual(['HP', 'MP']);
    });

    it('puts the ones the most pieces share ahead of the rest', () => {
      const first = makeCharacter('A');
      const second = makeCharacter('B');
      const third = makeCharacter('C');
      addResource(first, '正気度');
      addResource(second, '正気度');
      addResource(third, '弾薬');

      const names = derivedItemNames([first, second, third]);

      expect(names.indexOf('正気度')).toBeLessThan(names.indexOf('弾薬'));
    });

    it('stops before a full sheet becomes a wall of columns', () => {
      const character = makeCharacter();
      for (let index = 0; index < 20; index++) addResource(character, `項目${index}`);

      expect(derivedItemNames([character])).toHaveLength(8);
    });

    it('works nothing out from pieces that carry nothing', () => {
      expect(derivedItemNames([])).toEqual([]);
    });
  });

  describe('the items of a view', () => {
    it('shows what the room named, in the order it named them', () => {
      const character = makeCharacter();

      expect(displayItemNames(['MP', 'HP'], [character])).toEqual(['MP', 'HP']);
    });

    it('works them out only while the room has named none', () => {
      const character = makeCharacter();

      expect(displayItemNames([], [character]).slice(0, 2)).toEqual(['HP', 'MP']);
    });
  });

  describe('the items of the table', () => {
    it('adds the states the room keeps after the numbers', () => {
      const character = makeCharacter();

      expect(tableItemNames([], [character], ['毒', '麻痺']).slice(-2)).toEqual(['毒', '麻痺']);
    });

    it('says a state once where the pieces carry one of that name as well', () => {
      const character = makeCharacter();
      addResource(character, '毒');

      const names = tableItemNames([], [character], ['毒']);

      expect(names.filter((name) => name === '毒')).toHaveLength(1);
    });

    it('leaves what the room named alone, states and all', () => {
      const character = makeCharacter();

      expect(tableItemNames(['HP'], [character], ['毒'])).toEqual(['HP']);
    });

    it('says nothing at all where there is nothing to put under the states', () => {
      expect(tableItemNames([], [], ['毒', '麻痺'])).toEqual([]);
    });
  });
});
