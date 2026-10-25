import { TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameObjectInventoryService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] }));

  it('should be created', () => {
    const service: GameObjectInventoryService = TestBed.inject(GameObjectInventoryService);
    expect(service).toBeTruthy();
  });

  describe('in a room that names no items', () => {
    const created: GameCharacter[] = [];

    afterEach(() => {
      for (const character of created.splice(0)) character.destroy();
    });

    it('lays the columns out again when a piece renames a resource', async () => {
      const service = TestBed.inject(GameObjectInventoryService);
      service.dataTag = '';
      const [renaming, other] = ['A', 'B'].map((name) => {
        const character = GameCharacter.create(name, 1, '');
        character.setLocation('table');
        created.push(character);
        return character;
      });
      await Promise.resolve();
      const inventory = service.tableInventory;
      expect(inventory.dataElementMap.get(other.identifier)?.[0]?.name).toBe('HP');

      renaming.detailDataElement!.getElementsByName('HP')[0].name = '体力';
      await Promise.resolve();

      expect(inventory.dataTags.slice(0, 3)).toEqual(['体力', 'MP', 'HP']);
      expect(inventory.dataElementMap.get(other.identifier)?.[0]).toBeNull();
    });
  });

  describe('sorting by a step after the second', () => {
    const created: GameCharacter[] = [];

    afterEach(() => {
      for (const character of created.splice(0)) character.destroy();
      const service = TestBed.inject(GameObjectInventoryService);
      service.sortTag = '';
      service.sortTag2nd = 'name';
      service.extraSortKeys = [];
    });

    it('orders the pieces again when the step is added and when the value it reads changes', async () => {
      const service = TestBed.inject(GameObjectInventoryService);
      service.sortTag = 'HP';
      service.sortTag2nd = '';
      const [first, second] = [3, 9].map((luck, index) => {
        const character = GameCharacter.create(`P${index}`, 1, '');
        character.detailDataElement!.appendChild(DataElement.create('幸運', luck));
        character.setLocation('table');
        created.push(character);
        return character;
      });
      await Promise.resolve();
      const names = () => service.tableInventory.tabletopObjects.map((object) => object.identifier);
      expect(names()).toEqual([first.identifier, second.identifier]);

      service.extraSortKeys = [{ tag: '幸運', order: SortOrder.DESC }];
      await Promise.resolve();
      expect(names()).toEqual([second.identifier, first.identifier]);

      first.detailDataElement!.getFirstElementByName('幸運')!.value = 12;
      await Promise.resolve();
      expect(names()).toEqual([first.identifier, second.identifier]);
    });
  });
});
