import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { AuthorityEvent } from '@axe/core/network/server/server-protocol';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ChatTabSettingComponent } from '@axe/features/chat/chat-tab-setting/chat-tab-setting.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatTabSettingComponent', () => {
  let component: ChatTabSettingComponent;
  let fixture: ComponentFixture<ChatTabSettingComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ChatTabSettingComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChatTabSettingComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('with no tab open', () => {
    it('detects changes without falling over', () => {
      component.selectedTab.set(null);
      expect(() => fixture.detectChanges()).not.toThrow();
    });

    it('returns an empty name', () => {
      component.selectedTab.set(null);
      expect(component.tabName).toBe('');
    });
  });

  it('injects a change detector', () => {
    const cdr = fixture.debugElement.injector.get(ChangeDetectorRef);
    expect(cdr).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(ChatTabSettingComponent);
  });

  it('picks a tab it deleted as it comes back under its name, rather than holding on to the one taken away', async () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const keep = ChatTabList.instance.addChatTab('残す');
    const gone = ChatTabList.instance.addChatTab('作戦');
    try {
      component.selectedTab.set(gone);
      fixture.detectChanges();
      component.delete();
      await fixture.whenStable();

      const back = ChatTabList.instance.addChatTab('作戦', gone.identifier);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.selectedTab()).toBe(back);
      expect(component.selectedTabXml).toBe('');
      expect(component.isDeleted).toBe(false);
    } finally {
      keep.destroy();
      for (const tab of ChatTabList.instance.chatTabs.filter((tab) => tab.name === '作戦')) tab.destroy();
      PeerCursor.myCursor = null!;
    }
  });

  it('keeps no copy of a tab another seat deleted, so that no later offer brings that one back', async () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const gone = ChatTabList.instance.addChatTab('消される');
    const next = ChatTabList.instance.addChatTab('次');
    const change = TestBed.inject(ObjectChangeService) as unknown as {
      _objectDeleted$: { emit(event: { aliasName: string; identifier: string }): void };
    };
    try {
      component.selectedTab.set(gone);
      fixture.detectChanges();

      change._objectDeleted$.emit({ aliasName: gone.aliasName, identifier: gone.identifier });
      gone.destroy();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.selectedTabXml).toBe('');
      expect(component.isDeleted).toBe(false);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('元に戻す');
    } finally {
      next.destroy();
      PeerCursor.myCursor = null!;
    }
  });

  it('offers to bring a tab it deleted back, keeping it picked rather than moving on to another', async () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const keep = ChatTabList.instance.addChatTab('残す');
    const gone = ChatTabList.instance.addChatTab('消す');
    try {
      component.selectedTab.set(gone);
      fixture.detectChanges();

      component.delete();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.selectedTab()).toBe(gone);
      expect(component.isDeleted).toBe(true);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('元に戻す');
    } finally {
      keep.destroy();
      PeerCursor.myCursor = null!;
    }
  });

  it('says a deleted tab coming back under its name is coming back, before it is made again', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const tab = ChatTabList.instance.addChatTab('残す');
    const announce = vi.spyOn(ObjectStore.instance, 'announceComingBack');
    const parse = vi.spyOn(ObjectSerializer.instance, 'parseXml').mockReturnValue(null);
    try {
      component.selectedTab.set(tab);
      component.selectedTabXml =
        '<chat-tab identifier="gone-tab" name="消した"><chat identifier="gone-line">x</chat></chat-tab>';

      component.restore();

      expect(announce).toHaveBeenCalledWith(['gone-tab', 'gone-line']);
      expect(announce.mock.invocationCallOrder[0]).toBeLessThan(parse.mock.invocationCallOrder[0]);
    } finally {
      vi.restoreAllMocks();
      tab.destroy();
      PeerCursor.myCursor = null!;
    }
  });

  describe('clearing the log', () => {
    const originalCursor = PeerCursor.myCursor;

    afterEach(() => {
      PeerCursor.myCursor = originalCursor;
    });

    it('signs the notice with whoever asked for the clearing', () => {
      PeerCursor.myCursor = { userId: 'gm-user', name: 'GM', identifier: 'gm-cursor' } as PeerCursor;
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      try {
        tab.addMessage({ from: 'someone', name: '誰か', text: '消される発言', timestamp: 1000 });
        component.selectedTab.set(tab);
        component.allowDeleteLog = true;

        component.deleteLog();

        const notice = tab.chatMessages[tab.chatMessages.length - 1];
        expect(tab.chatMessages).toHaveLength(1);
        expect(notice.isSystemMessage).toBe(true);
        expect(notice.from).toBe('gm-user');
      } finally {
        tab.destroy();
      }
    });
  });

  describe('saves the log whatever the role, in good faith', () => {
    let saveData: SaveDataService;

    beforeEach(() => {
      saveData = TestBed.inject(SaveDataService);
    });

    afterEach(() => {
      PeerCursor.myCursor = null!;
      vi.restoreAllMocks();
    });

    it('lets a spectator save a tab they cannot read', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Guest;
      const tab = new ChatTab();
      tab.initialize();
      tab.guestCanView = false;
      component.selectedTab.set(tab);
      const spy = vi.spyOn(saveData, 'saveChatLog').mockResolvedValue(undefined);

      component.saveLog();

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][1]).toBe('tab');
      expect(spy.mock.calls[0][2]).toEqual([tab]);
    });

    it('lets them save every tab, unfiltered', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Guest;
      const spy = vi.spyOn(saveData, 'saveChatLog').mockResolvedValue(undefined);

      component.saveAllLog();

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][1]).toBe('all');
      expect(spy.mock.calls[0][2]).toEqual(component.chatTabs);
    });
  });

  describe('the style of the log', () => {
    let saveData: SaveDataService;

    beforeEach(() => {
      localStorage.removeItem(STORAGE_KEYS.chatLogStyle);
      localStorage.removeItem(STORAGE_KEYS.chatLogOmitDeleted);
      saveData = TestBed.inject(SaveDataService);
    });

    afterEach(() => {
      localStorage.removeItem(STORAGE_KEYS.chatLogStyle);
      localStorage.removeItem(STORAGE_KEYS.chatLogOmitDeleted);
      vi.restoreAllMocks();
    });

    it('saves in the style picked', () => {
      const tab = new ChatTab();
      tab.initialize();
      component.selectedTab.set(tab);
      const spy = vi.spyOn(saveData, 'saveChatLog').mockResolvedValue(undefined);

      component.chooseLogStyle('washi');
      component.saveLog();

      expect(spy.mock.calls[0][0]).toBe('washi');
    });

    it('keeps deleted lines in until asked to leave them out, for one tab or all', () => {
      const tab = new ChatTab();
      tab.initialize();
      component.selectedTab.set(tab);
      const spy = vi.spyOn(saveData, 'saveChatLog').mockResolvedValue(undefined);

      component.saveLog();
      component.setOmitDeleted(true);
      component.saveLog();
      component.saveAllLog();

      expect(spy.mock.calls.map((call) => call[4])).toEqual([
        { omitDeleted: false },
        { omitDeleted: true },
        { omitDeleted: true },
      ]);
    });

    it('writes the standard layout for the system tab in place of the one other tools read', () => {
      const systemTab = ChatTabList.instance.ensureSystemTab();
      try {
        component.selectedTab.set(systemTab);
        const spy = vi.spyOn(saveData, 'saveChatLog').mockResolvedValue(undefined);

        component.chooseLogStyle('coc');
        component.saveLog();

        expect(spy.mock.calls[0][0]).toBe('standard');
      } finally {
        systemTab.destroy();
      }
    });
  });

  describe('lets no spectator change the tabs themselves', () => {
    const beSeat = (role: PeerRole) => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = role;
    };

    afterEach(() => {
      (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
      PeerCursor.myCursor = null!;
    });

    it('offers a spectator none of it', () => {
      beSeat(PeerRole.Guest);
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.selectedTab.set(tab);

      expect(component.canEditTabs).toBe(false);
      expect(component.isEditable).toBe(false);
      expect(component.isDeletable).toBe(false);
      expect(component.isMovable).toBe(false);
    });

    it('offers a player all of it', () => {
      beSeat(PeerRole.Player);
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.selectedTab.set(tab);

      expect(component.canEditTabs).toBe(true);
      expect(component.isDeletable).toBe(true);
      expect(component.isMovable).toBe(true);
    });

    it('leaves the log where it is when a spectator asks for it to be cleared', () => {
      beSeat(PeerRole.Guest);
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      tab.addMessage({ from: 'someone', name: '誰か', text: '残るはずの発言', timestamp: 1000 });
      component.selectedTab.set(tab);
      component.allowDeleteLog = true;

      component.deleteLog();
      component.deleteLogALL();

      expect(tab.chatMessages).toHaveLength(1);
    });

    it('leaves the tab itself where it is', () => {
      beSeat(PeerRole.Guest);
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.selectedTab.set(tab);
      component.allowDeleteTab = true;

      component.delete();

      expect(ChatTabList.instance.chatTabs.some((each) => each.identifier === tab.identifier)).toBe(true);
    });

    it('adds no tab and renames none', () => {
      beSeat(PeerRole.Guest);
      const tab = ChatTabList.instance.addChatTab('もとの名前');
      component.selectedTab.set(tab);
      const before = ChatTabList.instance.chatTabs.length;

      component.create();
      component.tabName = 'あとの名前';

      expect(ChatTabList.instance.chatTabs).toHaveLength(before);
      expect(tab.name).toBe('もとの名前');
    });
  });

  describe('shows a spectator no way in', () => {
    const iconNames = (): string[] =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('i.material-icons')].map(
        (icon) => icon.textContent?.trim() ?? ''
      );
    const addButton = (): HTMLButtonElement | null => {
      const icons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('i.material-icons')];
      const icon = icons.find((each) => each.textContent?.trim() === 'add');
      return (icon?.closest('button') as HTMLButtonElement | null) ?? null;
    };

    const openATabAs = (role: PeerRole) => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = role;
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.selectedTab.set(tab);
      component.allowDeleteTab = true;
      component.allowDeleteLog = true;
      fixture.detectChanges();
      return tab;
    };

    afterEach(() => {
      (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
      PeerCursor.myCursor = null!;
    });

    it('draws no way to delete a tab or clear a log', () => {
      openATabAs(PeerRole.Guest);

      expect(iconNames()).not.toContain('delete');
      expect(iconNames()).not.toContain('delete_sweep');
      expect(iconNames()).not.toContain('delete_forever');
    });

    it('draws the way to add a tab as unavailable', () => {
      openATabAs(PeerRole.Guest);

      expect(addButton()?.disabled).toBe(true);
    });

    it('draws all of it for a player', () => {
      openATabAs(PeerRole.Player);

      expect(iconNames()).toContain('delete');
      expect(iconNames()).toContain('delete_sweep');
      expect(iconNames()).toContain('delete_forever');
      expect(addButton()?.disabled).toBe(false);
    });
  });

  describe('lets no spectator edit who may read or speak', () => {
    beforeEach(() => {});

    afterEach(() => {
      (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
      PeerCursor.myCursor = null!;
    });

    it('refuses a spectator even on a tab that can be edited', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Guest;
      const tab = ChatTabList.instance.addChatTab('test');
      component.selectedTab.set(tab);

      expect(component.canEditPermission).toBe(false);
    });

    it('changes nothing when a spectator sets a permission', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Guest;
      const tab = ChatTabList.instance.addChatTab('test');
      tab.guestCanSpeak = false;
      component.selectedTab.set(tab);

      component.setPerm('guestCanSpeak', true);

      expect(tab.guestCanSpeak).toBe(false);
    });

    it('lets a player set one', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Player;
      const tab = ChatTabList.instance.addChatTab('test');
      tab.guestCanSpeak = false;
      component.selectedTab.set(tab);

      expect(component.canEditPermission).toBe(true);

      component.setPerm('guestCanSpeak', true);

      expect(tab.guestCanSpeak).toBe(true);
    });
  });

  describe('in a room server’s room, holds a player to what the server lets them change', () => {
    const beSeat = (role: PeerRole) => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = role;
    };
    const rolledBy = (tab: ChatTab, text: string) => {
      const message = tab.addMessage({ from: 'System-BCDice', name: 'ダイス', text, timestamp: 1000 });
      message.serverRoll = true;
      return message;
    };

    beforeEach(() => {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    });

    afterEach(() => {
      vi.restoreAllMocks();
      (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
      PeerCursor.myCursor = null!;
    });

    it('lets a player change who may speak where they may read, but not who may read', () => {
      beSeat(PeerRole.Player);
      const tab = ChatTabList.instance.addChatTab('test');
      tab.plCanView = false;
      tab.plCanSpeak = false;
      tab.guestCanView = true;
      tab.guestCanSpeak = false;
      component.selectedTab.set(tab);

      component.setPerm('plCanView', true);
      component.setPerm('plCanSpeak', true);
      component.setPerm('guestCanView', false);
      component.setPerm('guestCanSpeak', true);

      expect([tab.plCanView, tab.plCanSpeak, tab.guestCanView, tab.guestCanSpeak]).toEqual([false, false, true, true]);
      expect(component.canEditPerm('plCanView')).toBe(false);
      expect(component.canEditPerm('guestCanSpeak')).toBe(true);
    });

    it('lets the game master change who may read', () => {
      beSeat(PeerRole.GameMaster);
      const tab = ChatTabList.instance.addChatTab('test');
      tab.plCanView = false;
      component.selectedTab.set(tab);

      component.setPerm('plCanView', true);

      expect(tab.plCanView).toBe(true);
    });

    it('lets a player among peers change who may read, as before', () => {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
      beSeat(PeerRole.Player);
      const tab = ChatTabList.instance.addChatTab('test');
      tab.plCanView = false;
      component.selectedTab.set(tab);

      component.setPerm('plCanView', true);

      expect(tab.plCanView).toBe(true);
    });

    it('lets a player delete no tab holding dice the server rolled, and says why', () => {
      beSeat(PeerRole.Player);
      const tab = ChatTabList.instance.addChatTab('test');
      rolledBy(tab, '2D6 → 7');
      component.selectedTab.set(tab);
      component.allowDeleteTab = true;
      fixture.detectChanges();

      component.delete();

      expect(component.isDeletable).toBe(false);
      expect(ObjectStore.instance.get(tab.identifier)).toBe(tab);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('GM だけが削除できます');
    });

    it('lets a player delete a tab with no dice the server rolled, and the game master any', () => {
      beSeat(PeerRole.Player);
      const plain = ChatTabList.instance.addChatTab('plain');
      plain.addMessage({ from: 'someone', name: '誰か', text: 'こんにちは', timestamp: 1000 });
      component.selectedTab.set(plain);
      expect(component.isDeletable).toBe(true);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      const rolled = ChatTabList.instance.addChatTab('rolled');
      rolledBy(rolled, '2D6 → 7');
      component.selectedTab.set(rolled);
      expect(component.isDeletable).toBe(true);
    });

    it('tells a player why the server put back a tab it deleted, holding dice it could not see', () => {
      beSeat(PeerRole.Player);
      const show = vi.spyOn(TestBed.inject(SnackbarService), 'show');
      const tab = ChatTabList.instance.addChatTab('hidden-rolls');
      component.selectedTab.set(tab);
      component.allowDeleteTab = true;

      component.delete();
      localDispatch(AuthorityEvent.AUTHORITATIVE, { ...tab.toContext() }, '@authority');

      expect(show).toHaveBeenCalledWith(TestBed.inject(TRANSLATE_FN)('feature.chat.tabSetting.deleteTurnedDown'));
    });

    it('gives no such reason for a tab it deleted that comes back with the room’s catalog', () => {
      beSeat(PeerRole.Player);
      const show = vi.spyOn(TestBed.inject(SnackbarService), 'show');
      const tab = ChatTabList.instance.addChatTab('lost-deletion');
      component.selectedTab.set(tab);
      component.allowDeleteTab = true;

      component.delete();
      ObjectStore.instance.forgetDeleted([tab.identifier]);
      ObjectStore.instance.add(new ChatTab(tab.identifier), false);
      localDispatch('UPDATE_GAME_OBJECT', { ...tab.toContext() }, '@authority');

      expect(show).not.toHaveBeenCalled();
    });

    it('says nothing of a tab it deleted and brought back itself', () => {
      beSeat(PeerRole.Player);
      const show = vi.spyOn(TestBed.inject(SnackbarService), 'show');
      const tab = ChatTabList.instance.addChatTab('brought-back');
      component.selectedTab.set(tab);
      component.allowDeleteTab = true;

      component.delete();
      component.restore();

      expect(show).not.toHaveBeenCalled();
    });

    it('leaves the dice the server rolled when a player clears a log, and the game master clears them too', () => {
      beSeat(PeerRole.Player);
      const tab = ChatTabList.instance.addChatTab('test');
      tab.addMessage({ from: 'someone', name: '誰か', text: '消える発言', timestamp: 1000 });
      const rolled = rolledBy(tab, '2D6 → 7');
      component.selectedTab.set(tab);
      component.allowDeleteLog = true;

      component.deleteLog();
      expect(tab.chatMessages.filter((message) => !message.isSystemMessage || message.isDicebot)).toEqual([rolled]);

      component.deleteLogALL();
      expect(tab.chatMessages).toContain(rolled);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      component.deleteLog();
      expect(tab.chatMessages).not.toContain(rolled);
    });

    it('clears and deletes no tab picked before the player could no longer read it', () => {
      beSeat(PeerRole.Player);
      const closed = ChatTabList.instance.addChatTab('closed');
      closed.addMessage({ from: 'someone', name: '誰か', text: '読めた発言', timestamp: 1000 });
      component.selectedTab.set(closed);
      component.allowDeleteLog = true;
      component.allowDeleteTab = true;
      closed.plCanView = false;

      component.deleteLog();
      component.delete();

      expect(ObjectStore.instance.get(closed.identifier)).toBe(closed);
      expect(closed.chatMessages.map((message) => message.text)).toEqual(['読めた発言']);
    });

    it('lists for a player only the tabs they may read, the others being out of their reach', () => {
      beSeat(PeerRole.Player);
      const open = ChatTabList.instance.addChatTab('open');
      const closed = ChatTabList.instance.addChatTab('closed');
      closed.plCanView = false;

      expect(component.chatTabs).toContain(open);
      expect(component.chatTabs).not.toContain(closed);
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(component.chatTabs).toContain(closed);
    });

    it('says nothing of a clear-all in a tab a player may not read, whose lines never came to them', () => {
      beSeat(PeerRole.Player);
      const open = ChatTabList.instance.addChatTab('open');
      const closed = ChatTabList.instance.addChatTab('closed');
      closed.plCanView = false;
      component.allowDeleteLog = true;

      component.deleteLogALL();

      expect(open.chatMessages.map((message) => message.isSystemMessage)).toEqual([true]);
      expect(closed.chatMessages).toEqual([]);
    });
  });

  describe('will not delete the system tab', () => {
    it('leaves it alone even while it is open', () => {
      const list = ChatTabList.instance;
      list.addChatTab('メイン');
      const system = list.ensureSystemTab();
      component.selectedTab.set(system);
      component.allowDeleteTab = true;

      component.delete();

      // Deleted, the arrivals and departures would come back into the conversation.
      expect(component.isDeletable).toBe(false);
      expect(list.chatTabs.some((tab) => tab.isSystemTab)).toBe(true);
    });

    it('deletes an ordinary tab as before', () => {
      const list = ChatTabList.instance;
      const main = list.addChatTab('メイン');
      list.ensureSystemTab();
      component.selectedTab.set(main);
      component.allowDeleteTab = true;

      expect(component.isDeletable).toBe(true);
      component.delete();

      expect(ObjectStore.instance.get(main.identifier)).toBeNull();
    });
  });
});
