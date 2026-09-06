import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
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
      const spy = vi.spyOn(saveData, 'saveHtmlChatLog').mockResolvedValue(undefined);

      component.saveLog();

      expect(spy).toHaveBeenCalledOnce();
    });

    it('lets them save every tab, unfiltered', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Guest;
      const spy = vi.spyOn(saveData, 'saveHtmlChatLogAll').mockResolvedValue(undefined);

      component.saveAllLog();

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][1]).toEqual(component.chatTabs);
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

    it('keeps the dedicated ticker tab and its fixed name', () => {
      const list = ChatTabList.instance;
      const ticker = list.ensureTickerTab();
      component.selectedTab.set(ticker);
      component.allowDeleteTab = true;

      component.tabName = '別名';
      component.delete();

      expect(component.isTickerTabSelected).toBe(true);
      expect(component.isDeletable).toBe(false);
      expect(component.isRenamable).toBe(false);
      expect(ObjectStore.instance.get(ticker.identifier)).toBe(ticker);
      expect(ticker.name).toBe('ティッカー');
    });
  });
});
