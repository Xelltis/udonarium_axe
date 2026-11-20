import { TestBed } from '@angular/core/testing';
import { ChatTabEditService } from '@axe/application/chat/chat-tab-edit.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatTabEditService', () => {
  let service: ChatTabEditService;
  let open: ChatTab;
  let closed: ChatTab;

  function beSeat(role: PeerRole): void {
    if (!PeerCursor.myCursor) PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
  }

  function said(tab: ChatTab): string[] {
    return tab.chatMessages.filter((line) => !line.isSystemMessage).map((line) => line.text);
  }

  function names(): string[] {
    return ChatTabList.instance.chatTabs
      .filter((tab) => [open, closed].includes(tab) || tab.name === '作戦')
      .map((tab) => tab.name);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatTabEditService);
    beSeat(PeerRole.Player);
    open = ChatTabList.instance.addChatTab('雑談');
    closed = ChatTabList.instance.addChatTab('GM用');
    closed.plCanView = false;
    closed.addMessage({ from: 'gm', name: 'GM', text: '秘密の発言', timestamp: 1000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const tab of [...ChatTabList.instance.chatTabs]) tab.destroy();
    ChatTabList.forget();
    PeerCursor.myCursor = null!;
  });

  describe('among peers as on a room server, holds a player to the tabs they may read', () => {
    it('offers and lets them manage only those', () => {
      expect(service.tabs()).toContain(open);
      expect(service.tabs()).not.toContain(closed);
      expect(service.mayManage(open)).toBe(true);
      expect(service.mayManage(closed)).toBe(false);
    });

    it('changes nothing of a tab kept from them, by any way there is to change one', () => {
      const index = ChatTabList.instance.systemMessageTabIndex;

      expect(service.rename(closed, '覗いた')).toBe(false);
      expect(service.setPermission(closed, 'plCanView', true)).toBe(false);
      expect(service.setPermission(closed, 'guestCanSpeak', true)).toBe(false);
      expect(service.moveTo(closed, 1)).toBe(false);
      expect(service.step(closed, -1)).toBe(false);
      expect(service.delete(closed)).toBe(false);
      service.clearAll();

      expect(closed.name).toBe('GM用');
      expect([closed.plCanView, closed.guestCanSpeak]).toEqual([false, false]);
      expect(ObjectStore.instance.get(closed.identifier)).toBe(closed);
      expect(said(closed)).toEqual(['秘密の発言']);
      expect(ChatTabList.instance.systemMessageTabIndex).toBe(index);
    });

    it('lets them manage a tab they may read, reading taken away taking speaking with it', () => {
      expect(service.rename(open, '作戦会議')).toBe(true);
      expect(service.setPermission(open, 'plCanView', false)).toBe(true);
      expect([open.name, open.plCanView, open.plCanSpeak]).toEqual(['作戦会議', false, false]);
    });

    it('clears every log but those of the tabs kept from them', () => {
      open.addMessage({ from: 'pl', name: 'PL', text: '消える発言', timestamp: 1000 });

      service.clearAll();

      expect(said(open)).toEqual([]);
      expect(said(closed)).toEqual(['秘密の発言']);
    });

    it('moves a tab past one kept from them as if it were not there, the notices staying on their tab', () => {
      const plan = ChatTabList.instance.addChatTab('作戦');
      ChatTabList.instance.systemMessageTabIndex = ChatTabList.instance.chatTabs.indexOf(open);

      expect(service.step(plan, -1)).toBe(true);

      expect(names()).toEqual(['作戦', '雑談', 'GM用']);
      expect(ChatTabList.instance.chatTabs[ChatTabList.instance.systemMessageTabIndex]).toBe(open);
    });

    it('keeps the notices on their tab when another is deleted before it', () => {
      const plan = ChatTabList.instance.addChatTab('作戦');
      ChatTabList.instance.systemMessageTabIndex = ChatTabList.instance.chatTabs.indexOf(plan);

      expect(service.delete(open)).toBe(true);

      expect(ChatTabList.instance.chatTabs[ChatTabList.instance.systemMessageTabIndex]).toBe(plan);
    });

    it('manages every tab for the game master', () => {
      beSeat(PeerRole.GameMaster);

      expect(service.rename(closed, '密談')).toBe(true);
      expect(service.delete(closed)).toBe(true);
    });
  });

  it('lets a guest manage no tab, not even one guests may read', () => {
    beSeat(PeerRole.Guest);
    open.addMessage({ from: 'pl', name: 'PL', text: '残る発言', timestamp: 1000 });

    expect(service.create('見学の部屋')).toBeNull();
    expect(service.rename(open, '覗いた')).toBe(false);
    expect(service.setPermission(open, 'guestCanSpeak', true)).toBe(false);
    expect(service.delete(open)).toBe(false);
    service.clearAll();

    expect([open.name, open.guestCanSpeak]).toEqual(['雑談', false]);
    expect(said(open)).toEqual(['残る発言']);
  });

  describe('on a room server', () => {
    beforeEach(() => {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    });

    it('holds who may read a tab to the game master, and who may speak to where they may read', () => {
      open.guestCanView = false;

      expect(service.setPermission(open, 'plCanView', false)).toBe(false);
      expect(service.setPermission(open, 'guestCanSpeak', true)).toBe(false);
      expect(service.setPermission(open, 'plCanSpeak', false)).toBe(true);
      expect([open.plCanView, open.guestCanSpeak, open.plCanSpeak]).toEqual([true, false, false]);
    });

    it('keeps a tab holding dice the server rolled for the game master to delete', () => {
      const rolled = open.addMessage({ from: 'System-BCDice', name: 'ダイス', text: '2D6 > 7', timestamp: 1000 });
      rolled.serverRoll = true;

      expect(service.deleteKeptForGameMaster(open)).toBe(true);
      expect(service.delete(open)).toBe(false);
      beSeat(PeerRole.GameMaster);
      expect(service.delete(open)).toBe(true);
    });
  });
});
