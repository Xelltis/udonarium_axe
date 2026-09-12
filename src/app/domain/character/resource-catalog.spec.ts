import { GameCharacter } from '@axe/domain/character/game-character';
import {
  isResourceElement,
  isResourceField,
  resourceCatalogOf,
  resourceElementsOf,
  resourceNamesOf,
} from '@axe/domain/character/resource-catalog';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
} from '@axe/domain/data/data-element';

describe('what the pieces of a table carry', () => {
  const created: GameCharacter[] = [];

  function makeCharacter(name = 'コマ'): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    created.push(character);
    return character;
  }

  function addField(character: GameCharacter, name: string, type: string, attributes: Record<string, string> = {}) {
    const field = DataElement.create(name, 0, {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      type,
      currentValue: 0,
      ...attributes,
    });
    character.detailDataElement!.appendChild(field);
    return field;
  }

  afterEach(() => {
    for (const character of created.splice(0)) character.destroy();
  });

  describe('what counts as a resource', () => {
    it('is anything that holds a value and a maximum', () => {
      const character = makeCharacter();

      expect(isResourceElement(addField(character, '気力', DataElementType.NUMBER_RESOURCE))).toBe(true);
      expect(isResourceElement(addField(character, 'ひとこと', DataElementType.TEXT))).toBe(false);
    });

    it('is not one of the sheet’s own workings', () => {
      const character = makeCharacter();
      character.addExtendData();

      expect(resourceElementsOf(character).map((element) => element.name)).not.toContain('ICON');
      expect(resourceElementsOf(character).map((element) => element.name)).not.toContain('POS');
    });

    it('reads data written before the field types as a resource all the same', () => {
      const character = makeCharacter();
      const legacy = addField(character, 'SAN', DataElementType.NUMBER_RESOURCE);

      expect(isResourceField(legacy)).toBe(true);
    });

    it('leaves out a resource the sheet shows as something else when asked for its fields', () => {
      const character = makeCharacter();
      addField(character, '計算値', DataElementType.NUMBER_RESOURCE, {
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CALC,
      });

      expect(resourceElementsOf(character).map((element) => element.name)).toContain('計算値');
      expect(resourceElementsOf(character, { fieldsOnly: true }).map((element) => element.name)).not.toContain(
        '計算値'
      );
    });

    it('reads one piece in the order its sheet reads', () => {
      const character = makeCharacter();

      expect(resourceElementsOf(character).map((element) => element.name)).toEqual(['HP', 'MP']);
    });
  });

  describe('the names to offer by name', () => {
    it('gathers them from every piece, once each and in order', () => {
      const first = makeCharacter('A');
      const second = makeCharacter('B');
      addField(second, '弾薬', DataElementType.NUMBER_RESOURCE);

      expect(resourceNamesOf([first, second])).toEqual(['HP', 'MP', '弾薬']);
    });

    it('offers nothing for no pieces', () => {
      expect(resourceNamesOf([])).toEqual([]);
    });
  });

  describe('the catalogue of what can be operated on', () => {
    function namesOf(characters: GameCharacter[], listFirst: string[] = []): string[] {
      return resourceCatalogOf(characters, { listFirst }).map((entry) => entry.name);
    }

    it('puts the names it was asked to lead with at the head, in that order', () => {
      const character = makeCharacter();

      expect(resourceCatalogOf([character], { listFirst: ['MP', 'HP'] }).slice(0, 2)).toEqual([
        { name: 'MP', isResource: true },
        { name: 'HP', isResource: true },
      ]);
    });

    it('passes over a name no piece carries', () => {
      const character = makeCharacter();

      expect(namesOf([character], ['HP', '架空の項目', 'MP']).slice(0, 2)).toEqual(['HP', 'MP']);
    });

    it('offers an item only one of the pieces carries', () => {
      // An item is operated on by name, so one the reader's own piece has never had is still
      // theirs to move on somebody else's.
      const plain = makeCharacter('ふつうのコマ');
      const cursed = makeCharacter('狂ったコマ');
      addField(cursed, '正気度', DataElementType.NUMBER_RESOURCE);

      expect(namesOf([plain, cursed], ['HP'])).toContain('正気度');
    });

    it('offers what it was not asked to lead with behind what it was', () => {
      const character = makeCharacter();
      addField(character, '弾薬', DataElementType.NUMBER_RESOURCE);

      const names = namesOf([character], ['HP']);

      expect(names[0]).toBe('HP');
      expect(names.indexOf('弾薬')).toBeGreaterThan(0);
    });

    it('offers a name once however many pieces carry it', () => {
      expect(namesOf([makeCharacter('A'), makeCharacter('B')], ['HP']).filter((name) => name === 'HP')).toHaveLength(1);
    });

    it('offers what can be written to as well as what holds a number', () => {
      const character = makeCharacter();
      addField(character, 'ひとこと', DataElementType.TEXT);

      const catalogue = resourceCatalogOf([character]);

      expect(catalogue.find((entry) => entry.name === 'HP')?.isResource).toBe(true);
      expect(catalogue.find((entry) => entry.name === 'ひとこと')?.isResource).toBe(false);
    });

    it('leaves out an item nothing can be written to', () => {
      const character = makeCharacter();
      addField(character, '紋章', DataElementType.IMAGE);

      expect(namesOf([character])).not.toContain('紋章');
    });

    it('leaves out one of the sheet’s own workings', () => {
      const character = makeCharacter();
      character.addExtendData();

      expect(namesOf([character])).not.toContain('ICON');
    });

    it('leaves out a name one sheet carries twice, which nothing can point at', () => {
      const character = makeCharacter();
      addField(character, '副HP', DataElementType.NUMBER_RESOURCE);
      addField(character, '副HP', DataElementType.NUMBER_RESOURCE);

      expect(namesOf([character])).not.toContain('副HP');
    });

    it('offers nothing for no pieces at all', () => {
      expect(resourceCatalogOf([], { listFirst: ['HP'] })).toEqual([]);
    });
  });
});
