import { TestBed } from '@angular/core/testing';
import { ObjectInventory } from '@axe/application/inventory/object-inventory';
import { Network } from '@axe/core/index';
import { ObjectStore } from '@axe/core/sync/object-store';
import { resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementRole, DataElementType } from '@axe/domain/data/data-element';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { parseBuffInput } from '@axe/features/controller/remote-controller/remote-controller-buff';
import {
  controllableResourcesOf,
  getGameObjects,
  getInventory,
  getInventoryTags,
  getTabTitle,
  getTargetCharacters,
  RemoteControllerInventoryContext,
} from '@axe/features/controller/remote-controller/remote-controller-helpers';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('remote-controller-helpers', () => {
  let inventoryContext: RemoteControllerInventoryContext;
  const createdChars: GameCharacter[] = [];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    DataSummarySetting.instance.dataTag = '';
    inventoryContext = {
      tableInventory: new ObjectInventory((object) => object.location.name === 'table'),
      commonInventory: new ObjectInventory(() => false),
      privateInventory: new ObjectInventory((object) => object.location.name === Network.peerId),
      graveyardInventory: new ObjectInventory((object) => object.location.name === 'graveyard'),
    };
  });

  afterEach(() => {
    for (const char of createdChars) {
      ObjectStore.instance.remove(char);
    }
    createdChars.length = 0;
    DataSummarySetting.instance.dataTag = 'HP MP SAN 敏捷度 精神力 情報';
  });

  function createChar(name: string, location = 'table'): GameCharacter {
    const char = GameCharacter.create(name, 1, '');
    char.location.name = location;
    createdChars.push(char);
    return char;
  }

  describe('parseBuffInput', () => {
    it('reads the name, the note and the round apart by their spaces', () => {
      expect(parseBuffInput('猛攻撃 攻撃+2 5')).toMatchObject({ buffname: '猛攻撃', sub: '攻撃+2', round: 5 });
    });

    it('takes a colour and an icon after them', () => {
      const parsed = parseBuffInput('毒 継続2 3 red ☠️');

      expect(parsed!.appearance).toEqual({ color: resolveBuffColor('red'), icon: '☠️' });
      expect(parsed!.bufftext).toContain('red');
    });

    it('leaves both empty when neither is given', () => {
      expect(parseBuffInput('猛攻撃')!.appearance).toEqual({});
    });

    it('reads nothing from an empty line', () => {
      expect(parseBuffInput('')).toBeNull();
    });
  });

  describe('getTabTitle', () => {
    it('names the table', () => {
      expect(getTabTitle('table')).toBe('テーブル');
    });

    it('names your own hands', () => {
      expect(getTabTitle(Network.peerId)).toBe('個人');
    });

    it('names the graveyard', () => {
      expect(getTabTitle('graveyard')).toBe('墓場');
    });

    it('names anywhere else shared', () => {
      expect(getTabTitle('common')).toBe('共有');
    });
  });

  describe('getInventory', () => {
    it('should return tableInventory for "table" type', () => {
      const inventory = getInventory('table', inventoryContext);
      expect(inventory).toBe(inventoryContext.tableInventory);
    });

    it('should return privateInventory for Network.peerId type', () => {
      const inventory = getInventory(Network.peerId, inventoryContext);
      expect(inventory).toBe(inventoryContext.privateInventory);
    });

    it('should return graveyardInventory for "graveyard" type', () => {
      const inventory = getInventory('graveyard', inventoryContext);
      expect(inventory).toBe(inventoryContext.graveyardInventory);
    });

    it('should return commonInventory for other types', () => {
      const inventory = getInventory('common', inventoryContext);
      expect(inventory).toBe(inventoryContext.commonInventory);
    });
  });

  describe('getInventoryTags', () => {
    it('should return empty array when no tags exist for character', () => {
      const character = createChar('char-1');
      inventoryContext.tableInventory.refreshObjects();
      inventoryContext.tableInventory.refreshDataElements();

      const result = getInventoryTags(character, inventoryContext);
      expect(result).toEqual([]);
    });
  });

  describe('controllableResourcesOf', () => {
    function addField(character: GameCharacter, name: string, type: string): void {
      character.detailDataElement!.appendChild(
        DataElement.create(name, 0, {
          [DataElementAttribute.ROLE]: DataElementRole.FIELD,
          type,
          currentValue: 0,
        })
      );
    }

    function namesOf(characters: GameCharacter[], tags: string[]): string[] {
      const { tagged, others } = controllableResourcesOf(characters, tags);
      return [...tagged, ...others].map((choice) => choice.name);
    }

    it('lists what the room shows of everybody first, in the order it lists them', () => {
      const char = createChar('カウンター対象');

      expect(controllableResourcesOf([char], ['MP', 'HP']).tagged).toEqual([
        { name: 'MP', isResource: true },
        { name: 'HP', isResource: true },
      ]);
    });

    it('passes over a tag no piece carries', () => {
      const char = createChar('カウンター対象');

      expect(controllableResourcesOf([char], ['HP', '架空の項目', 'MP']).tagged.map((choice) => choice.name)).toEqual([
        'HP',
        'MP',
      ]);
    });

    it('offers an item only one of the pieces carries', () => {
      // Which is the point of it: an item is operated on by name, so one the reader's own
      // piece has never had is still theirs to move on somebody else's.
      const plain = createChar('ふつうのコマ');
      const cursed = createChar('狂ったコマ');
      addField(cursed, '正気度', DataElementType.NUMBER_RESOURCE);

      expect(namesOf([plain, cursed], ['HP'])).toContain('正気度');
    });

    it('keeps an item the room does not show out of the first row', () => {
      const char = createChar('カウンター対象');
      addField(char, '弾薬', DataElementType.NUMBER_RESOURCE);

      const { tagged, others } = controllableResourcesOf([char], ['HP']);

      expect(tagged.map((choice) => choice.name)).toEqual(['HP']);
      expect(others.map((choice) => choice.name)).toContain('弾薬');
    });

    it('offers a name once however many pieces carry it', () => {
      const first = createChar('a');
      const second = createChar('b');

      expect(namesOf([first, second], ['HP']).filter((name) => name === 'HP')).toHaveLength(1);
    });

    it('says which items have a maximum as well as a value', () => {
      const char = createChar('カウンター対象');
      addField(char, 'ひとこと', DataElementType.TEXT);

      const { others } = controllableResourcesOf([char], []);

      expect(others.find((choice) => choice.name === 'HP')?.isResource).toBe(true);
      expect(others.find((choice) => choice.name === 'ひとこと')?.isResource).toBe(false);
    });

    it('leaves out an item nothing can be written to', () => {
      const char = createChar('カウンター対象');
      addField(char, '紋章', DataElementType.IMAGE);

      expect(namesOf([char], [])).not.toContain('紋章');
    });

    it('leaves out a name one sheet carries twice, which nothing can point at', () => {
      const char = createChar('カウンター対象');
      addField(char, '副HP', DataElementType.NUMBER_RESOURCE);
      addField(char, '副HP', DataElementType.NUMBER_RESOURCE);

      expect(namesOf([char], [])).not.toContain('副HP');
    });

    it('offers nothing for no pieces at all', () => {
      expect(controllableResourcesOf([], ['HP'])).toEqual({ tagged: [], others: [] });
    });
  });

  describe('getGameObjects', () => {
    it('should filter out hideInventory characters for table type', () => {
      const char1 = createChar('visible');
      const char2 = createChar('hidden');
      char1.hideInventory = false;
      char2.hideInventory = true;
      inventoryContext.tableInventory.refreshObjects();

      const result = getGameObjects('table', inventoryContext);
      expect(result).toContain(char1);
      expect(result).not.toContain(char2);
    });

    it('should return empty array for non-table types', () => {
      const result = getGameObjects('common', inventoryContext);
      expect(result).toEqual([]);
    });
  });

  describe('getTargetCharacters', () => {
    it('should return all non-hidden characters in objectList when checkedOnly=false', () => {
      const mockChar1 = createChar('a');
      const mockChar2 = createChar('b');
      const mockChar3 = createChar('c');
      mockChar1.hideInventory = false;
      mockChar1.targeted = false;
      mockChar2.hideInventory = false;
      mockChar2.targeted = true;
      mockChar3.hideInventory = true;
      mockChar3.targeted = true;

      const result = getTargetCharacters([mockChar1, mockChar2, mockChar3], false);
      expect(result.length).toBe(2);
      expect(result).toContain(mockChar1);
      expect(result).toContain(mockChar2);
    });

    it('should return only targeted characters when checkedOnly=true', () => {
      const mockChar1 = createChar('a');
      const mockChar2 = createChar('b');
      mockChar1.hideInventory = false;
      mockChar1.targeted = false;
      mockChar2.hideInventory = false;
      mockChar2.targeted = true;

      const result = getTargetCharacters([mockChar1, mockChar2], true);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(mockChar2);
    });

    it('should never include hideInventory characters even when targeted=true', () => {
      const mockChar = createChar('hidden');
      mockChar.hideInventory = true;
      mockChar.targeted = true;

      const result = getTargetCharacters([mockChar], false);
      expect(result.length).toBe(0);
    });
  });
});
