import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataElement, DataElementAttribute, DataElementRole, DataElementType } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { RemoteControllerComponent } from '@axe/features/controller/remote-controller/remote-controller.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RemoteControllerComponent', () => {
  let component: RemoteControllerComponent;
  let fixture: ComponentFixture<RemoteControllerComponent>;
  const createdChars: GameCharacter[] = [];

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [RemoteControllerComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RemoteControllerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const char of createdChars) {
      ObjectStore.instance.remove(char);
    }
    createdChars.length = 0;
  });

  function createChar(name: string): GameCharacter {
    const char = GameCharacter.create(name, 1, '');
    createdChars.push(char);
    return char;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(RemoteControllerComponent, {
      beforeOpen: () => {
        if (ChatTabList.instance.chatTabs.length < 1) {
          ChatTabList.instance.addChatTab('テストタブ');
        }
      },
      initialize: (opened) => {
        opened.character.set(createChar('テスト'));
      },
    });
  });

  describe('targetBlockClick', () => {
    it('turns a target off', () => {
      const char = createChar('test');
      char.targeted = true;
      component.targetBlockClick(char);
      expect(char.targeted).toBe(false);
    });

    it('turns one on', () => {
      const char = createChar('test');
      char.targeted = false;
      component.targetBlockClick(char);
      expect(char.targeted).toBe(true);
    });

    it('says the targets have changed', () => {
      const uiSignalService = TestBed.inject(UiSignalService);
      const spy = vi.spyOn(uiSignalService, 'notifyTargetChange');
      const char = createChar('test');
      component.targetBlockClick(char);
      expect(spy).toHaveBeenCalledWith(char.identifier, 'character');
    });
  });

  describe('getTargetCharacters', () => {
    it('returns the targeted characters alone when asked for them', () => {
      const char1 = createChar('a');
      const char2 = createChar('b');
      char1.targeted = true;
      char2.targeted = false;
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char1, char2]);

      const result = component.getTargetCharacters(true);
      expect(result).toEqual([char1]);
    });

    it('returns every character that is not hidden otherwise', () => {
      const char1 = createChar('a');
      const char2 = createChar('b');
      char1.targeted = true;
      char2.targeted = false;
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char1, char2]);

      const result = component.getTargetCharacters(false);
      expect(result).toEqual([char1, char2]);
    });

    it('leaves out a character hidden from the list', () => {
      const char1 = createChar('a');
      const char2 = createChar('b');
      char1.targeted = true;
      char1.hideInventory = true;
      char2.targeted = true;
      char2.hideInventory = false;
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char1, char2]);

      const result = component.getTargetCharacters(true);
      expect(result).toEqual([char2]);
    });
  });

  describe('counterChoices', () => {
    function addResource(character: GameCharacter, name: string): void {
      character.detailDataElement!.appendChild(
        DataElement.create(name, 0, {
          [DataElementAttribute.ROLE]: DataElementRole.FIELD,
          type: DataElementType.NUMBER_RESOURCE,
          currentValue: 0,
        })
      );
    }

    function offeredNames(): string[] {
      return component.counterChoices().map((choice) => choice.name);
    }

    it('builds the buttons from the pieces that are targeted', () => {
      const targeted = createChar('狙ったコマ');
      const other = createChar('ほかのコマ');
      addResource(targeted, '正気度');
      addResource(other, '弾薬');
      targeted.targeted = true;
      other.targeted = false;
      vi.spyOn(component, 'getGameObjects').mockReturnValue([targeted, other]);

      expect(offeredNames()).toContain('正気度');
      expect(offeredNames()).not.toContain('弾薬');
    });

    it('stands in with every piece in the tab while none is targeted', () => {
      const first = createChar('a');
      const second = createChar('b');
      addResource(second, '弾薬');
      vi.spyOn(component, 'getGameObjects').mockReturnValue([first, second]);

      expect(offeredNames()).toContain('弾薬');
    });

    it('lets go of a chosen item the pieces no longer carry', () => {
      const char = createChar('コマ');
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char]);
      component.remoteSelect('架空の項目', 'now', '架空の項目');

      component.dropChosenIfGone();

      expect(component.remoteControllerSelect().name).toBe('');
    });

    it('keeps one they do carry', () => {
      const char = createChar('コマ');
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char]);
      component.remoteSelect('HP', 'now', 'HP現在値');

      component.dropChosenIfGone();

      expect(component.remoteControllerSelect().name).toBe('HP');
    });
  });

  describe('the items the room picks for its remotes', () => {
    function addItem(character: GameCharacter, name: string, type: string): DataElement {
      const element = DataElement.create(name, 3, {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        type,
        ...(type === DataElementType.NUMBER_RESOURCE ? { currentValue: 3 } : {}),
      });
      character.detailDataElement!.appendChild(element);
      return element;
    }

    afterEach(() => {
      Config.instance.controllerResources = null;
    });

    it('offers every item while the room has picked none', () => {
      const char = createChar('コマ');
      addItem(char, '正気度', DataElementType.NUMBER_RESOURCE);
      addItem(char, '信仰', DataElementType.TEXT);
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char]);

      expect(component.counterChoices().map((choice) => choice.name)).toEqual(
        expect.arrayContaining(['正気度', '信仰'])
      );
    });

    it('offers only the items picked, as soon as the pick changes', () => {
      const char = createChar('コマ');
      addItem(char, '正気度', DataElementType.NUMBER_RESOURCE);
      addItem(char, '信仰', DataElementType.TEXT);
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char]);
      component.counterChoices();

      Config.instance.controllerResources = ['信仰'];
      TestBed.inject(ObjectChangeService).notifyChanged('Config');

      expect(component.counterChoices().map((choice) => choice.name)).toEqual(['信仰']);
    });

    it('leaves an item not picked off the cards, keeping a check box and the line breaks', () => {
      const char = createChar('コマ');
      const sanity = addItem(char, '正気度', DataElementType.NUMBER_RESOURCE);
      const faith = addItem(char, '信仰', DataElementType.TEXT);
      const poisoned = addItem(char, '毒', DataElementType.CHECK);
      const lineBreak = DataElement.create(component.newLineString);
      const inventory = TestBed.inject(GameObjectInventoryService);
      vi.spyOn(inventory.tableInventory, 'dataElementMap', 'get').mockReturnValue(
        new Map([[char.identifier, [sanity, lineBreak, faith, null, poisoned]]])
      );
      char.setLocation('table');

      Config.instance.controllerResources = ['信仰'];
      TestBed.inject(ObjectChangeService).notifyChanged('Config');

      expect(component.getInventoryTags(char)).toEqual([lineBreak, faith, null, poisoned]);
    });
  });

  describe('which part of an item is moved', () => {
    function chooseHp(): void {
      const char = createChar('コマ');
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char]);
      const hp = component.counterChoices().find((choice) => choice.name === 'HP')!;
      component.chooseResource(hp);
    }

    it('offers every slot of a resource', () => {
      chooseHp();

      expect(component.chosenSlots()).toEqual(['now', 'max', 'maxBase', 'maxCorrection', 'minBase', 'minCorrection']);
    });

    it('offers none for an item that has only its value', () => {
      const char = createChar('コマ');
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char]);
      const text = component.counterChoices().find((choice) => !choice.isResource)!;

      component.chooseResource(text);

      expect(component.chosenSlots()).toEqual([]);
    });

    it('starts on the value itself', () => {
      chooseHp();

      expect(component.isChosenSlot('now')).toBe(true);
    });

    it('takes a slot and says so in what the operation will read as', () => {
      chooseHp();

      component.chooseSlot('maxBase');

      expect(component.remoteControllerSelect().nowOrMax).toBe('maxBase');
      expect(component.remoteControllerSelect().dispName).toContain('HP');
      expect(component.isChosenSlot('maxBase')).toBe(true);
    });

    it('keeps the slot as the item changes, so a row of pieces takes the same part', () => {
      chooseHp();
      component.chooseSlot('maxBase');
      const mp = component.counterChoices().find((choice) => choice.name === 'MP')!;

      component.chooseResource(mp);

      expect(component.remoteControllerSelect()).toMatchObject({ name: 'MP', nowOrMax: 'maxBase' });
    });

    it('falls back to the value for an item with no other part to move', () => {
      chooseHp();
      component.chooseSlot('maxCorrection');
      const text = component.counterChoices().find((choice) => !choice.isResource)!;

      component.chooseResource(text);

      expect(component.remoteControllerSelect().nowOrMax).toBe('now');
    });
  });

  describe('allBoxCheck', () => {
    it('targets every character', () => {
      const char1 = createChar('a');
      const char2 = createChar('b');
      char1.targeted = false;
      char2.targeted = false;
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char1, char2]);

      component.allBoxCheck({ check: true });
      expect(char1.targeted).toBe(true);
      expect(char2.targeted).toBe(true);
    });

    it('clears every target', () => {
      const char1 = createChar('a');
      const char2 = createChar('b');
      char1.targeted = true;
      char2.targeted = true;
      vi.spyOn(component, 'getGameObjects').mockReturnValue([char1, char2]);

      component.allBoxCheck({ check: false });
      expect(char1.targeted).toBe(false);
      expect(char2.targeted).toBe(false);
    });
  });
});
