import { TestBed } from '@angular/core/testing';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { Config } from '@axe/domain/peer/config';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { ensureFogMemoryOn, fogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';

describe('save and load round trip', () => {
  let store: ObjectStore;
  let serializer: ObjectSerializer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
    serializer = ObjectSerializer.instance;
    (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
  });

  afterEach(() => {
    (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
  });

  describe("the room's own rules", () => {
    afterEach(() => {
      (Config as unknown as { _instance: Config | undefined })._instance = undefined;
    });

    it('carries every answer through a save and a load', () => {
      const config = Config.instance;
      config.moveRangeEnabled = false;
      config.moveDiagonally = false;
      config.zocExtraCost = 0;
      config.cellDistance = 5;
      config.cellDistanceUnit = 'foot';
      config.zocMode = 'stop';

      const xml = serializer.toXml(config);
      serializer.parseXml(xml);

      expect(Config.instance.moveRangeEnabled).toBe(false);
      expect(Config.instance.moveDiagonally).toBe(false);
      expect(Config.instance.zocExtraCost).toBe(0);
      expect(Config.instance.cellDistance).toBe(5);
      expect(Config.instance.cellDistanceUnit).toBe('foot');
      expect(Config.instance.zocMode).toBe('stop');
    });

    it('carries how the round is taken through a save and a load', () => {
      const config = Config.instance;
      config.turnOrderMode = 'faction';
      config.factionPhaseMode = 'initiative';
      config.factionOrder = 'p-a,p-b';
      config.factionSkipUnassigned = true;

      const xml = serializer.toXml(config);
      serializer.parseXml(xml);

      expect(Config.instance.turnOrderMode).toBe('faction');
      expect(Config.instance.factionPhaseMode).toBe('initiative');
      expect(Config.instance.factionOrder).toBe('p-a,p-b');
      expect(Config.instance.factionSkipUnassigned).toBe(true);
    });

    it('reads a room that was saved before it had rules to answer for', () => {
      const xml = '<config identifier="Config" _defaultDiceBot="DiceBot"></config>';

      serializer.parseXml(xml);

      expect(Config.instance.roomRuleAnswers.zocMode).toBeNull();
      expect(Config.instance.roomRuleAnswers.cellDistance).toBeNull();
      expect(Config.instance.roomRuleAnswers.moveRangeEnabled).toBeNull();
    });
  });

  describe('terrain serialisation', () => {
    it('registers terrain with the object factory', () => {
      const obj = ObjectFactory.instance.create('terrain');
      expect(obj).toBeTruthy();
      expect(obj).toBeInstanceOf(Terrain);
      obj?.destroy();
    });

    it('writes every sync var as an attribute', () => {
      const terrain = Terrain.create('山岳', 3, 4, 2, 'w', 'f');
      terrain.isLocked = true;
      terrain.mode = TerrainViewState.WALL;
      terrain.rotate = 90;
      terrain.isGrid = true;

      const xml = serializer.toXml(terrain);

      expect(xml).toContain('isLocked="true"');
      expect(xml).toContain('mode="2"');
      expect(xml).toContain('rotate="90"');
      expect(xml).toContain('isGrid="true"');
    });

    it('writes the location in dotted notation', () => {
      const terrain = Terrain.create('t', 1, 1, 1, '', '');
      terrain.location = { name: 'table', x: 150, y: 250 };
      terrain.posZ = 42;

      const xml = serializer.toXml(terrain);

      expect(xml).toContain('location.name="table"');
      expect(xml).toContain('location.x="150"');
      expect(xml).toContain('location.y="250"');
      expect(xml).toContain('posZ="42"');
    });

    it('writes the data elements as children', () => {
      const terrain = Terrain.create('砂漠', 5, 6, 3, 'wall-id', 'floor-id');

      const xml = serializer.toXml(terrain);

      expect(xml).toContain('<data');
      expect(xml).toContain('name="terrain"');
      expect(xml).toContain('name="wall"');
      expect(xml).toContain('name="floor"');
      expect(xml).toContain('>wall-id</data>');
      expect(xml).toContain('>floor-id</data>');
      expect(xml).toContain('>砂漠</data>');
    });

    it('carries what the party has explored with the table', () => {
      const table = new GameTable();
      table.initialize();
      const grid = cellGridOf(4, 4, 50, GridType.SQUARE);
      const bits = new CellBits(cellCount(grid));
      bits.set(0);
      bits.set(15);
      ensureFogMemoryOn(table).write(grid, bits);

      const xml = serializer.toXml(table);
      expect(xml).toContain('<fog-memory');

      const restored = serializer.parseXml(xml) as GameTable;
      const memory = fogMemoryOn(restored);
      expect(memory).not.toBeNull();
      expect(memory?.read(grid).equals(bits)).toBe(true);
    });

    it('forgets what it held once the fog is cleared, and says that it has', () => {
      const table = new GameTable();
      table.initialize();
      const grid = cellGridOf(4, 4, 50, GridType.SQUARE);
      const bits = new CellBits(cellCount(grid));
      bits.set(3);
      const memory = ensureFogMemoryOn(table);
      memory.write(grid, bits);

      memory.reset();

      expect(memory.read(grid).isEmpty).toBe(true);
      expect(memory.generation).toBe(1);
    });

    it('includes the terrain of a table in its own xml', () => {
      const table = new GameTable();
      table.initialize();
      const terrain = Terrain.create('丘', 2, 2, 1, '', '');
      table.appendChild(terrain);

      const xml = serializer.toXml(table);

      expect(xml).toContain('<game-table');
      expect(xml).toContain('<terrain');
      expect(xml).toContain('>丘</data>');
    });
  });

  describe('shared tabletop-display table settings', () => {
    it('keeps the view the table recommends in the room data', () => {
      const table = new GameTable('shared-tabletop-settings');
      table.mode2d = true;
      table.initialize();

      const xml = serializer.toXml(table);
      const restored = serializer.parseXml(xml) as GameTable;

      expect(xml).toContain('mode2d="true"');
      expect(restored.mode2d).toBe(true);
    });

    it('keeps what drifts under the board in the room data', () => {
      const table = new GameTable('background-layers');
      table.initialize();
      const layer = new TableBackgroundLayer();
      layer.initialize();
      layer.order = 2;
      layer.speedX = -40;
      layer.speedY = 15;
      layer.opacity = 0.6;
      layer.scale = 1.5;
      layer.placement = 'over';
      table.appendChild(layer);

      const xml = serializer.toXml(table);
      const restored = serializer.parseXml(xml) as GameTable;

      const back = restored.backgroundLayers;
      expect(back).toHaveLength(1);
      expect(back[0].order).toBe(2);
      expect(back[0].speedX).toBe(-40);
      expect(back[0].speedY).toBe(15);
      expect(back[0].opacity).toBe(0.6);
      expect(back[0].scale).toBe(1.5);
      expect(back[0].placedOver).toBe(true);
    });
  });

  describe('data element round trip, within the limits of happy-dom', () => {
    it('writes and reads a data element back', () => {
      const original = DataElement.create('testName', 'testValue', { type: 'image' });
      const xml = serializer.toXml(original);

      original.destroy();
      store.clearDeleteHistory();

      const restored = serializer.parseXml(xml) as DataElement;
      expect(restored).toBeInstanceOf(DataElement);
      expect(restored.getAttribute('name')).toBe('testName');
      expect(restored.value).toBe('testValue');
      expect(restored.getAttribute('type')).toBe('image');
    });

    it('keeps nested data elements together', () => {
      const root = DataElement.create('root', '');
      const child1 = DataElement.create('name', '地形A');
      const child2 = DataElement.create('width', 5);
      root.appendChild(child1);
      root.appendChild(child2);

      const xml = serializer.toXml(root);
      root.destroy();
      store.clearDeleteHistory();

      const restored = serializer.parseXml(xml) as DataElement;
      expect(restored.children).toHaveLength(2);
      expect(restored.getFirstElementByName('name')?.value).toBe('地形A');
      expect(restored.getFirstElementByName('width')?.value).toBe('5');
    });

    it('keeps the role, type and metadata of a custom field', () => {
      const section = DataElement.create('能力', '', {
        [DataElementAttribute.ROLE]: DataElementRole.SECTION,
      });
      const selectField = DataElement.create('種族', '人間', {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT,
        [DataElementAttribute.CHOICES]: '人間,エルフ,ドワーフ',
      });
      const numberField = DataElement.create('筋力', 24, {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
        [DataElementAttribute.UNIT]: '点',
        [DataElementAttribute.MIN]: '0',
        [DataElementAttribute.MAX]: '100',
      });
      section.appendChild(selectField);
      section.appendChild(numberField);

      const xml = serializer.toXml(section);
      section.destroy();
      store.clearDeleteHistory();

      const restored = serializer.parseXml(xml) as DataElement;
      const restoredSelect = restored.getFirstElementByName('種族');
      const restoredNumber = restored.getFirstElementByName('筋力');

      expect(restored.fieldRole).toBe(DataElementRole.SECTION);
      expect(restoredSelect?.fieldRole).toBe(DataElementRole.FIELD);
      expect(restoredSelect?.fieldType).toBe(DataElementFieldType.SELECT);
      expect(restoredSelect?.getAttribute(DataElementAttribute.CHOICES)).toBe('人間,エルフ,ドワーフ');
      expect(restoredNumber?.fieldType).toBe(DataElementFieldType.NUMBER);
      expect(restoredNumber?.getAttribute(DataElementAttribute.UNIT)).toBe('点');
      expect(restoredNumber?.getAttribute(DataElementAttribute.MIN)).toBe('0');
      expect(restoredNumber?.getAttribute(DataElementAttribute.MAX)).toBe('100');
    });
  });

  describe('game character round trip', () => {
    it('writes the column settings of the detail card when saving a character', () => {
      const character = GameCharacter.create('カラム確認', 1, '');
      const section = character.detailDataElement!.getFirstElementByName('能力')!;
      section.setAttribute('cs-colspan', 'full');
      section.setAttribute(DataElementAttribute.POPUP, 'true');

      const xml = serializer.toXml(character);
      const sectionXml = serializer.toXml(section);

      expect(xml).toContain('cs-colspan="full"');
      expect(xml).toContain('cs-popup="true"');

      character.destroy();
      store.clearDeleteHistory();

      const restoredSection = serializer.parseXml(sectionXml) as DataElement;

      expect(restoredSection.getAttribute('cs-colspan')).toBe('full');
      expect(restoredSection.getAttribute(DataElementAttribute.POPUP)).toBe('true');
    });
  });

  describe('hotbar round trip', () => {
    function hotbarFor(userId: string): Hotbar {
      const hotbar = new Hotbar(`Hotbar_${userId}`);
      hotbar.ownerUserId = userId;
      hotbar.initialize();
      return hotbar;
    }

    it('registers the hotbar and its slots with the object factory', () => {
      expect(ObjectFactory.instance.create('hotbar')).toBeInstanceOf(Hotbar);
      expect(ObjectFactory.instance.create('hotbar-slot')).toBeInstanceOf(HotbarSlot);
    });

    it('writes a slot down with where it sits and who it acts as', () => {
      const character = GameCharacter.create('ホットバー確認', 1, '');
      const hotbar = hotbarFor('reader');
      const draft = emptyHotbarSlotDraft('chat');
      draft.value = '2d6+3 攻撃';
      draft.label = '全力攻撃';
      draft.characterIdentifier = character.identifier;
      hotbar.put(1, 4, draft);

      const xml = serializer.toXml(hotbar);

      expect(xml).toContain('ownerUserId="reader"');
      expect(xml).toContain('page="1"');
      expect(xml).toContain('slotIndex="4"');
      expect(xml).toContain('label="全力攻撃"');
      expect(xml).toContain(`characterIdentifier="${character.identifier}"`);
      expect(xml).toContain('2d6+3 攻撃');

      character.destroy();
      store.clearDeleteHistory();
    });

    it('reads a slot back with its place as numbers', () => {
      const hotbar = hotbarFor('reader');
      const draft = emptyHotbarSlotDraft('effect');
      draft.value = '爆炎';
      hotbar.put(2, 9, draft);
      const slotXml = serializer.toXml(hotbar.slotAt(2, 9)!);

      hotbar.destroy();
      store.clearDeleteHistory();

      const restored = serializer.parseXml(slotXml) as HotbarSlot;

      expect(restored.pageNo).toBe(2);
      expect(restored.slotNo).toBe(9);
      expect(restored.slotKind).toBe('effect');
      expect(restored.argument).toBe('爆炎');
    });

    it('reads a slot whose place was never written as the first one', () => {
      const slot = new HotbarSlot();
      slot.initialize();

      expect(slot.pageNo).toBe(0);
      expect(slot.slotNo).toBe(0);
      expect(slot.slotKind).toBe('chat');
      expect(slot.characterIdentifier).toBe('');
    });
  });

  describe('chat tab list discards the tabs it replaces', () => {
    // the DOMParser in happy-dom cannot handle dotted attribute names such as imageIdentifier.0, so a test
    // cannot go through the toXml output of ChatTab.
    // Instead it builds the smallest xml that carries no dotted attribute and hands it to
    // serializer.parseXml to exercise ChatTabList.parseInnerXml.
    // Given an Element, parseXml bypasses the DOMParser, so the child <chat-tab> elements
    // reach parseXml directly as Elements.

    it('discards both starting tabs, the case that broke when the list was mutated mid-iteration', () => {
      const instance = ChatTabList.instance;
      instance.addChatTab('Tab1');
      instance.addChatTab('Tab2');
      expect(instance.chatTabs).toHaveLength(2);

      const reloadCheck = new ReloadCheck('ReloadCheck');
      reloadCheck.initialize();
      reloadCheck.reloadCheckStart(false);

      // the smallest xml with no dotted attribute
      const xml = '<chat-tab-list><chat-tab name="NewOnly"></chat-tab></chat-tab-list>';
      serializer.parseXml(xml);

      // A loaded room always gains a system tab; only the conversation tabs are counted.
      expect(instance.spokenChatTabs).toHaveLength(1);
      expect(instance.spokenChatTabs[0].name).toBe('NewOnly');
      expect(instance.chatTabs.some((tab) => tab.isSystemTab)).toBe(true);
    });

    it('discards all three starting tabs', () => {
      const instance = ChatTabList.instance;
      instance.addChatTab('A');
      instance.addChatTab('B');
      instance.addChatTab('C');
      expect(instance.chatTabs).toHaveLength(3);

      const reloadCheck = new ReloadCheck('ReloadCheck');
      reloadCheck.initialize();
      reloadCheck.reloadCheckStart(false);

      const xml = '<chat-tab-list></chat-tab-list>';
      serializer.parseXml(xml);

      expect(instance.spokenChatTabs).toHaveLength(0);
      expect(instance.chatTabs.some((tab) => tab.isSystemTab)).toBe(true);
    });

    it('discards the existing tabs and adds the new ones', () => {
      const instance = ChatTabList.instance;
      instance.addChatTab('Old1');
      instance.addChatTab('Old2');
      expect(instance.chatTabs).toHaveLength(2);

      const reloadCheck = new ReloadCheck('ReloadCheck');
      reloadCheck.initialize();
      reloadCheck.reloadCheckStart(false);

      const xml = [
        '<chat-tab-list>',
        '  <chat-tab name="New1"></chat-tab>',
        '  <chat-tab name="New2"></chat-tab>',
        '  <chat-tab name="New3"></chat-tab>',
        '</chat-tab-list>',
      ].join('');
      serializer.parseXml(xml);

      const names = instance.spokenChatTabs.map((t) => t.name);
      expect(names).not.toContain('Old1');
      expect(names).not.toContain('Old2');
      expect(instance.spokenChatTabs).toHaveLength(3);
      expect(names).toContain('New1');
      expect(names).toContain('New2');
      expect(names).toContain('New3');
    });
  });
});
