import { TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { sortObjectsByKeys } from '@axe/application/inventory/game-object-inventory-helpers';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { GameCharacter } from '@axe/domain/character/game-character';
import { liftImageReferences } from '@axe/domain/chat/chat-image-references';
import { evaluateCharacterReferences } from '@axe/domain/chat/chat-palette';
import { DataElement, DataElementFieldType, DataElementType } from '@axe/domain/data/data-element';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';
import type { ElementAliasTable } from '@axe/domain/data/element-alias';
import { findReferencedElement } from '@axe/domain/data/element-reference';
import {
  applyResourceEdit,
  applyTextEdit,
  convertCommandToResourceEdit,
  createDefaultResourceEdit,
  type ResourceEdit,
} from '@axe/domain/data/resource-edit-helpers';
import { sheetNumberOf } from '@axe/domain/tabletop/move/move-cells';
import { buildInventoryRow } from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryTableView } from '@axe/features/inventory/game-object-inventory/inventory-table-view';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const SPEED: ElementAliasTable = [{ name: '行動値', candidates: ['基本/行動値', '戦闘/行動値', 'イニシアティブ'] }];

function resource(name: string, max: number, current: number): DataElement {
  return DataElement.create(name, max, { type: DataElementType.NUMBER_RESOURCE, currentValue: String(current) });
}

function section(character: GameCharacter, name: string, ...fields: DataElement[]): void {
  const group = DataElement.create(name, '');
  character.detailDataElement!.appendChild(group);
  for (const field of fields) group.appendChild(field);
}

function addTo(amount: number, target = '行動値'): ResourceEdit {
  return {
    ...createDefaultResourceEdit(),
    target,
    operator: '+',
    calcAns: amount,
    option: { limitMinMax: false, zeroLimit: false, isErr: false },
  };
}

/**
 * The places a sheet's item is referred to by name, each read and written through the room's
 * aliases: a sheet that carries 行動値 twice, and one that only carries イニシアティブ.
 */
describe('the aliases of a room, wherever an item is referred to by name', () => {
  let twice: GameCharacter;
  let first: DataElement;
  let second: DataElement;
  let single: GameCharacter;
  let initiative: DataElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    twice = GameCharacter.create('二つ持ち', 1, '');
    first = resource('行動値', 20, 10);
    second = resource('行動値', 20, 12);
    section(twice, '基本', first);
    section(twice, '戦闘', second);
    single = GameCharacter.create('一つ持ち', 1, '');
    initiative = DataElement.create('イニシアティブ', 7);
    section(single, '基本', initiative);
    DataSummarySetting.instance.aliases = SPEED;
  });

  afterEach(() => {
    twice.destroy();
    single.destroy();
    vi.restoreAllMocks();
  });

  describe('a resource command and a rule that names an item', () => {
    it('reads the first candidate a piece carries', () => {
      expect(twice.status.getValue('行動値', 'now')).toBe(10);
      expect(single.status.getValue('行動値', 'now')).toBe(7);
    });

    it('takes the alias for a name a command may change', () => {
      expect(twice.status.canChangeName('行動値')).toBe(true);
      const edit = createDefaultResourceEdit();
      expect(convertCommandToResourceEdit(edit, ':行動値+3', twice, false)).toBe(true);
      expect(edit.target).toBe('行動値');
    });

    it('sets every candidate on the piece to what the first came to', () => {
      const report = applyResourceEdit(addTo(3), twice);

      expect(report).toContain('10');
      expect(report).toContain('13');
      expect(first.currentValue).toBe(13);
      expect(second.currentValue).toBe(13);
    });

    it('holds each candidate under its own maximum', () => {
      second.value = 12;

      applyResourceEdit(addTo(5), twice);

      expect(first.currentValue).toBe(15);
      expect(second.currentValue).toBe(12);
    });

    it('changes the one candidate of a piece that carries only one', () => {
      applyResourceEdit(addTo(3), single);

      expect(initiative.value).toBe(10);
    });

    it('writes a maximum to every candidate that has one', () => {
      twice.status.setValue('行動値', 'max', 30);

      expect(first.value).toBe(30);
      expect(second.value).toBe(30);
    });

    it('writes words to every candidate', () => {
      const edit = { ...createDefaultResourceEdit(), target: '行動値', replace: '未行動' };

      applyTextEdit(edit, twice);

      expect(first.currentValue).toBe('未行動');
      expect(second.currentValue).toBe('未行動');
    });

    it('reads the number a move is counted from', () => {
      expect(sheetNumberOf(twice, '行動値')).toBe(10);
      expect(sheetNumberOf(single, '行動値')).toBe(7);
    });
  });

  describe('the order of the candidates and a room without the alias', () => {
    it('reads another item once the candidates are put in another order', () => {
      DataSummarySetting.instance.aliases = [{ name: '行動値', candidates: ['戦闘/行動値', '基本/行動値'] }];

      expect(twice.status.getValue('行動値', 'now')).toBe(12);
    });

    it('goes back to a name two items answer to meaning neither, once the alias is taken away', () => {
      DataSummarySetting.instance.aliases = [];

      expect(twice.status.getValue('行動値', 'now')).toBeNull();
      expect(single.status.getValue('行動値', 'now')).toBeNull();
      expect(findReferencedElement(twice.rootDataElement!, '基本/行動値')).toBe(first);
    });
  });

  describe('a line of chat', () => {
    it('fills {alias} in from the speaker', () => {
      expect(evaluateCharacterReferences('2d6+{行動値}', twice).text).toBe('2d6+10');
      expect(evaluateCharacterReferences('2d6+{行動値}', single).text).toBe('2d6+7');
    });

    it('fills t{alias} in from the piece the line is aimed at', () => {
      expect(evaluateCharacterReferences('t{行動値}', single, twice).text).toBe('10');
    });

    it('takes a picture out of the line by its alias', () => {
      const picture = DataElement.create('立ち絵', 'image-1');
      picture.setFieldType(DataElementFieldType.IMAGE);
      section(single, '画像', picture);
      DataSummarySetting.instance.aliases = [{ name: '顔', candidates: ['立ち絵'] }];

      const lifted = liftImageReferences('見て {顔}', single.rootDataElement, []);

      expect(lifted.attachmentImageIdentifiers).toEqual(['image-1']);
    });
  });

  describe('the order pieces are listed and take their turns in', () => {
    it('sorts by the alias, each piece by the candidate it carries', () => {
      const third = GameCharacter.create('三番目', 1, '');
      section(third, '基本', DataElement.create('イニシアティブ', 11));

      const sorted = sortObjectsByKeys([single, twice, third], [{ tag: '行動値', order: SortOrder.DESC }]);

      expect(sorted).toEqual([third, twice, single]);
      third.destroy();
    });
  });

  describe('the display items of the inventory', () => {
    it('shows the first candidate of each piece under the one column', async () => {
      const service = TestBed.inject(GameObjectInventoryService);
      twice.setLocation('table');
      single.setLocation('table');
      service.dataTag = '行動値';
      await Promise.resolve();

      const elements = service.tableInventory.dataElementMap;

      expect(elements.get(twice.identifier)).toEqual([first]);
      expect(elements.get(single.identifier)).toEqual([initiative]);
    });

    it('finds the items again when the room names, reorders or drops the alias', async () => {
      const service = TestBed.inject(GameObjectInventoryService);
      twice.setLocation('table');
      service.dataTag = '行動値';
      DataSummarySetting.instance.aliases = [];
      await Promise.resolve();
      expect(service.tableInventory.dataElementMap.get(twice.identifier)).toEqual([null]);

      DataSummarySetting.instance.aliases = SPEED;
      await Promise.resolve();
      expect(service.tableInventory.dataElementMap.get(twice.identifier)).toEqual([first]);

      DataSummarySetting.instance.aliases = [{ name: '行動値', candidates: ['戦闘/行動値', '基本/行動値'] }];
      await Promise.resolve();
      expect(service.tableInventory.dataElementMap.get(twice.identifier)).toEqual([second]);
    });

    it('puts the pieces in order again when an item behind the alias it is sorted by changes', async () => {
      const service = TestBed.inject(GameObjectInventoryService);
      twice.setLocation('table');
      single.setLocation('table');
      service.sortTag = '行動値';
      service.sortOrder = SortOrder.DESC;
      await Promise.resolve();
      expect(service.tableInventory.tabletopObjects).toEqual([twice, single]);

      initiative.value = 99;
      await Promise.resolve();

      expect(service.tableInventory.tabletopObjects).toEqual([single, twice]);
    });

    it('lays the alias out as a column of the table view', () => {
      const ailments = TestBed.inject(StatusAilmentService);
      Object.defineProperty(ailments, 'ailments', { value: () => [], configurable: true });
      vi.spyOn(TestBed.inject(GameObjectInventoryService), 'tableDataTags', 'get').mockReturnValue(['行動値']);
      const rows = [twice, single].map((piece) => buildInventoryRow(piece, ''));
      const view = TestBed.runInInjectionContext(() => new InventoryTableView({ rows: () => rows }));

      const table = view.table();

      expect(table.rows.map((row) => row.cells[0].element)).toEqual([first, initiative]);
      expect(table.rows.map((row) => row.cells[0].kind)).toEqual(['numberResource', 'value']);
    });
  });

  describe('a saved room and a room shared with an older version', () => {
    const serializer = ObjectSerializer.instance;

    it('carries the aliases through a save and a load', () => {
      const xml = serializer.toXml(DataSummarySetting.instance);
      DataSummarySetting.instance.aliases = [];

      serializer.parseXml(xml);

      expect(DataSummarySetting.instance.aliases).toEqual(SPEED);
      expect(twice.status.getValue('行動値', 'now')).toBe(10);
    });

    it('reads a room saved before there were aliases as a room with none', () => {
      serializer.parseXml('<summary-setting sortTag="HP" dataTag="HP MP"></summary-setting>');

      expect(DataSummarySetting.instance.elementAliases).toBe('');
      expect(DataSummarySetting.instance.aliases).toEqual([]);
      expect(DataSummarySetting.instance.sortTag).toBe('HP');
      expect(twice.status.getValue('行動値', 'now')).toBeNull();
    });

    it('reads an empty or broken value as no aliases, never as one', () => {
      for (const value of ['', '[]', '{}', 'null', '[{"name":""', '[{"name":"","candidates":["基本/行動値"]}]']) {
        DataSummarySetting.instance.elementAliases = value;

        expect(DataSummarySetting.instance.aliases, value).toEqual([]);
        expect(twice.status.getValue('行動値', 'now'), value).toBeNull();
      }
    });

    it('saves the aliases in an attribute of their own, beside the ones an older version reads', () => {
      const setting = DataSummarySetting.instance;
      setting.sortTag = 'HP';
      setting.dataTag = 'HP 行動値';
      const withAliases = serializer.toXml(setting);
      setting.aliases = [];
      const without = serializer.toXml(setting);

      expect(without).toContain('elementAliases=""');
      expect(withAliases).not.toContain('elementAliases=""');
      expect(withAliases.replace(/ elementAliases="[^"]*"/, ' elementAliases=""')).toBe(without);
    });

    it('reaches another seat of this version with the rest of the setting', () => {
      const sent = DataSummarySetting.instance.toContext();
      DataSummarySetting.instance.aliases = [];

      DataSummarySetting.instance.apply(sent);

      expect(DataSummarySetting.instance.aliases).toEqual(SPEED);
    });

    it('has no aliases after a setting arrives from a seat that knows none', () => {
      const sent = DataSummarySetting.instance.toContext();
      const { elementAliases: _dropped, ...older } = sent.syncData;
      sent.syncData = { ...older, sortTag: 'HP' };

      DataSummarySetting.instance.apply(sent);

      expect(DataSummarySetting.instance.aliases).toEqual([]);
      expect(DataSummarySetting.instance.sortTag).toBe('HP');
      expect(twice.status.getValue('行動値', 'now')).toBeNull();
    });
  });
});
