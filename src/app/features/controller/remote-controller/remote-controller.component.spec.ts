import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleLaunchService } from '@axe/application/battle/battle-launch.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataElement, DataElementAttribute, DataElementRole, DataElementType } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RemoteControllerComponent } from '@axe/features/controller/remote-controller/remote-controller.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
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

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(RemoteControllerComponent));
  });

  it('lists a piece this seat may not view by its name alone, and takes it only where it is ticked', () => {
    const open = createChar('勇者');
    const kept = createChar('秘密の魔物');
    open.setLocation('table');
    kept.setLocation('table');
    vi.spyOn(TestBed.inject(DisclosureService), 'canView').mockImplementation((character) => character !== kept);
    component.selectTab.set('table');
    fixture.detectChanges();

    expect(component.getGameObjects('table')).toContain(kept);
    expect(component.getTargetCharacters(false)).toContain(open);
    expect(component.getTargetCharacters(false)).not.toContain(kept);
    kept.targeted = true;
    expect(component.getTargetCharacters(true)).toEqual([kept]);
    const card = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="remote-target-秘密の魔物"]')!;
    expect(card.parentElement!.textContent).not.toContain('バフ');
    kept.targeted = false;
  });

  it('names a piece whose name is kept from this seat by no name in the list', () => {
    const masked = createChar('黒幕');
    masked.setLocation('table');
    masked.hideName = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    component.selectTab.set('table');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('黒幕');
    expect(root.querySelector('[data-testid="remote-target-？？？"]')).not.toBeNull();
  });

  it('names the piece anew in its title once its name is hidden while the remote is open', async () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    const villain = createChar('黒幕');
    component.character.set(villain);
    TestBed.tick();
    const panel = (component as unknown as { panelService: { title: string } }).panelService;
    expect(panel.title).toContain('黒幕');

    villain.hideName = true;
    await Promise.resolve();
    TestBed.tick();

    expect(panel.title).toContain('？？？');
    expect(panel.title).not.toContain('黒幕');
  });

  it('leaves out a piece the table does not draw for this seat, in the dark, under the fog or in stealth', () => {
    const seen = createChar('勇者');
    const unseen = createChar('潜む魔物');
    seen.setLocation('table');
    unseen.setLocation('table');
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation((character) => character !== unseen);

    expect(component.getGameObjects('table')).toContain(seen);
    expect(component.getGameObjects('table')).not.toContain(unseen);
  });

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

  it('shows each palette line as written, with nothing before or after it', () => {
    const char = createChar('テスト');
    char.remoteController!.setPalette('HP-1\n//回復=3');
    component.character.set(char);
    fixture.detectChanges();

    const row = (line: number) =>
      (fixture.nativeElement as HTMLElement).querySelector(`[data-line="${line}"]`)!.textContent;
    expect(row(0)).toBe('HP-1');
    expect(row(1)).toBe('//回復=3');
  });

  describe('the tabs the panel sends its word to', () => {
    afterEach(() => {
      for (const tab of [...ChatTabList.instance.chatTabs]) tab.destroy();
    });

    it('lists only the tabs this seat may read and speak in, and moves off one closed to it', () => {
      const open = ChatTabList.instance.addChatTab('雑談');
      const watched = ChatTabList.instance.addChatTab('観戦');
      watched.plCanSpeak = false;
      const hidden = ChatTabList.instance.addChatTab('GMだけ');
      hidden.plCanView = false;
      fixture = TestBed.createComponent(RemoteControllerComponent);
      component = fixture.componentInstance;

      expect(component.sendableChatTabs()).toEqual([open]);
      expect(component.chatTabidentifier()).toBe(open.identifier);

      open.plCanSpeak = false;
      TestBed.inject(ObjectChangeService).notifyChanged(open.identifier);
      TestBed.tick();

      expect(component.sendableChatTabs()).toEqual([]);
      expect(component.chatTabidentifier()).toBe('');
    });

    it('says nothing without a tab it may speak in, rather than in another', () => {
      const watched = ChatTabList.instance.addChatTab('観戦');
      watched.plCanSpeak = false;
      fixture = TestBed.createComponent(RemoteControllerComponent);
      component = fixture.componentInstance;
      const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendMessage');

      component.character.set(createChar('テスト'));
      component['announce']('HPを1減らしました', { portraitIndex: 0 });

      expect(said).not.toHaveBeenCalled();
      vi.restoreAllMocks();
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

    it('keeps the items of a ticked piece whose contents are kept from this seat off the buttons', () => {
      const open = createChar('勇者');
      const kept = createChar('秘密の魔物');
      addResource(open, '正気度');
      addResource(kept, '隠し玉');
      kept.targeted = true;
      vi.spyOn(component, 'getGameObjects').mockReturnValue([open, kept]);
      vi.spyOn(TestBed.inject(DisclosureService), 'canView').mockImplementation((character) => character !== kept);

      expect(offeredNames()).toContain('正気度');
      expect(offeredNames()).not.toContain('隠し玉');
      kept.targeted = false;
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
      // Japanese runs the item and the part together, with nothing between to read as a missing word.
      expect(component.remoteControllerSelect().dispName).toBe('HP最大値ベース');
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

    it('leaves a piece kept from the reader to its own row, and still takes it off with the rest', () => {
      const shown = createChar('a');
      const keptBack = createChar('b');
      vi.spyOn(TestBed.inject(DisclosureService), 'canView').mockImplementation((character) => character !== keptBack);
      vi.spyOn(component, 'getGameObjects').mockReturnValue([shown, keptBack]);

      component.allBoxCheck({ check: true });
      expect([shown.targeted, keptBack.targeted]).toEqual([true, false]);

      keptBack.targeted = true;
      component.allBoxCheck({ check: false });
      expect([shown.targeted, keptBack.targeted]).toEqual([false, false]);
    });
  });
  describe('the battle stage', () => {
    let battle: { play: ReturnType<typeof vi.fn>; playLineupAs: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      localStorage.clear();
      battle = TestBed.inject(BattleLaunchService) as unknown as typeof battle;
      vi.spyOn(battle, 'play').mockReturnValue({} as never);
      vi.spyOn(battle, 'playLineupAs').mockReturnValue({} as never);
    });

    it('has the character it works for strike the ticked targets', () => {
      const hero = createChar('勇者');
      const goblin = createChar('ゴブリン');
      component.character.set(hero);
      vi.spyOn(component, 'getTargetCharacters').mockReturnValue([goblin, hero]);

      component.playBattle();

      expect(battle.play).toHaveBeenCalledWith({ attacker: hero, defenders: [goblin] }, 'everywhere');
      expect(battle.playLineupAs).not.toHaveBeenCalled();
    });

    it('has the character it works for strike the other side of the lineup, with no target ticked', () => {
      const hero = createChar('勇者');
      component.character.set(hero);
      vi.spyOn(component, 'getTargetCharacters').mockReturnValue([]);

      component.playBattle();

      expect(battle.playLineupAs).toHaveBeenCalledWith(hero, 'everywhere');
    });

    it('plays nothing for the room for one who only watches', () => {
      const role = PeerCursor.myCursor.role;
      PeerCursor.myCursor.role = PeerRole.Guest;
      try {
        component.character.set(createChar('勇者'));
        vi.spyOn(component, 'getTargetCharacters').mockReturnValue([createChar('ゴブリン')]);

        component.playBattle();

        expect(battle.play).not.toHaveBeenCalled();
        expect(battle.playLineupAs).not.toHaveBeenCalled();
      } finally {
        PeerCursor.myCursor.role = role;
      }
    });

    it('says so when there is no bout to play', () => {
      component.character.set(createChar('勇者'));
      vi.spyOn(component, 'getTargetCharacters').mockReturnValue([]);
      battle.playLineupAs.mockReturnValue(null);

      component.playBattle();

      expect(component.errorMessageController).not.toBe('');
    });

    it('plays a change made from here on the stage, reading the targets before it is made', () => {
      const hero = createChar('勇者');
      const goblin = createChar('ゴブリン');
      const hpBefore = Number(goblin.detailDataElement?.getFirstElementByName('HP')?.currentValue);
      component.character.set(hero);
      fixture.detectChanges();
      vi.spyOn(component, 'getTargetCharacters').mockReturnValue([goblin]);
      vi.spyOn(component as unknown as { announce: () => void }, 'announce').mockImplementation(() => undefined);
      const finish = vi.spyOn(battle as unknown as BattleLaunchService, 'finish').mockReturnValue(null);
      component.remoteControllerSelect.set({ name: 'HP', nowOrMax: 'now', dispName: 'HP' });
      component.remoteNumber = -3;

      component.remoteChangeValue();
      expect(finish).not.toHaveBeenCalled();

      component.setBattleOnChange(true);
      component.remoteChangeValue();

      expect(finish).toHaveBeenCalledTimes(1);
      const [take] = finish.mock.calls[0];
      expect(take.request.attacker).toBe(hero);
      expect(take.request.defenders).toEqual([goblin]);
      const reading = [...(take.before.get(goblin.identifier)?.resources.values() ?? [])].find(
        (resource) => resource.name === 'HP'
      );
      expect(reading?.current).toBe(hpBefore - 3);
    });

    it('says only the change to a piece kept from anyone, and what is left to the game masters alone', () => {
      const hero = createChar('勇者');
      const goblin = createChar('ゴブリン');
      goblin.disclosureMode = 'gm';
      const hpBefore = Number(goblin.detailDataElement?.getFirstElementByName('HP')?.currentValue);
      component.character.set(hero);
      fixture.detectChanges();
      vi.spyOn(component, 'getTargetCharacters').mockReturnValue([goblin]);
      const said = { tabIdentifier: 'tab', timestamp: 10, name: '勇者' };
      const announce = vi
        .spyOn(component as unknown as { announce: (text: string) => unknown }, 'announce')
        .mockReturnValue(said);
      const told = vi
        .spyOn(
          component as unknown as { tellThoseWhoMaySee: (line: unknown, text: string, pieces: unknown) => void },
          'tellThoseWhoMaySee'
        )
        .mockImplementation(() => undefined);
      component.remoteControllerSelect.set({ name: 'HP', nowOrMax: 'now', dispName: 'HP' });
      component.remoteNumber = -3;

      component.remoteChangeValue();

      expect(announce.mock.calls[0][0]).toContain('[ゴブリン]');
      expect(announce.mock.calls[0][0]).not.toContain(`${hpBefore - 3}`);
      expect(told).toHaveBeenCalledWith(said, expect.stringContaining(`[ゴブリン ${hpBefore}>${hpBefore - 3}]`), [
        goblin,
      ]);

      announce.mockClear();
      told.mockClear();
      component.remoteNumber = -hpBefore;
      component.remoteChangeValue();

      expect(announce.mock.calls[0][0]).toContain(`[ゴブリン ${hpBefore - 3}>`);
      expect(told).not.toHaveBeenCalled();
    });

    it('remembers whether changes are played on the stage', () => {
      component.setBattleOnChange(true);

      expect(component.battleOnChange()).toBe(true);
      expect(TestBed.createComponent(RemoteControllerComponent).componentInstance.battleOnChange()).toBe(true);
    });
  });
});
