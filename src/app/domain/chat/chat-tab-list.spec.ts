import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import {
  SYSTEM_CHAT_TAB_IDENTIFIER,
  SYSTEM_CHAT_TAB_NAME,
  TICKER_CHAT_TAB_IDENTIFIER,
  TICKER_CHAT_TAB_NAME,
} from '@axe/domain/chat/constants';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

describe('ChatTabList', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
    // Reset singleton
    (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
  });

  afterEach(() => {
    (ChatTabList as unknown as { _instance: ChatTabList | undefined })._instance = undefined;
  });

  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      const instance1 = ChatTabList.instance;
      const instance2 = ChatTabList.instance;
      expect(instance1).toBe(instance2);
    });

    it('identifies itself as the tab list', () => {
      expect(ChatTabList.instance.identifier).toBe('ChatTabList');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts sending the system messages to the first tab', () => {
      expect(ChatTabList.instance.systemMessageTabIndex).toBe(0);
    });
  });

  describe('chatTabs', () => {
    it('starts empty', () => {
      expect(ChatTabList.instance.chatTabs).toEqual([]);
    });
  });

  describe('addChatTab()', () => {
    it('adds a tab by name', () => {
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      expect(tab).toBeTruthy();
      expect(tab.name).toBe('テストタブ');
      expect(ChatTabList.instance.chatTabs).toHaveLength(1);
    });

    it('adds one it is given', () => {
      const tab = new ChatTab();
      tab.name = 'テスト';
      tab.initialize();
      ChatTabList.instance.addChatTab(tab);
      expect(ChatTabList.instance.chatTabs).toHaveLength(1);
    });

    it('adds one against an identifier', () => {
      const tab = ChatTabList.instance.addChatTab('タブ', 'custom-tab-id');
      expect(tab.identifier).toBe('custom-tab-id');
    });
  });

  describe('systemMessageTab', () => {
    it('returns nothing while there are no tabs', () => {
      expect(ChatTabList.instance.systemMessageTab).toBeFalsy();
    });

    it('returns the tab at an index', () => {
      ChatTabList.instance.addChatTab('メイン');
      ChatTabList.instance.addChatTab('サブ');
      ChatTabList.instance.systemMessageTabIndex = 1;
      expect(ChatTabList.instance.systemMessageTab!.name).toBe('サブ');
    });
  });

  describe('the portrait settings', () => {
    it('starts at the default height', () => {
      expect(ChatTabList.instance.portraitHeight).toBe(200);
    });

    it('starts at the default smallest size', () => {
      expect(ChatTabList.instance.minPortraitSize).toBe(100);
    });

    it('starts at the default largest', () => {
      expect(ChatTabList.instance.maxPortraitSize).toBe(500);
    });

    it('starts with the portrait outside the window', () => {
      expect(ChatTabList.instance.isPortraitInWindow).toBe(false);
    });
  });

  describe('simpleDispFlag', () => {
    it('starts with the simple time display off', () => {
      expect(ChatTabList.instance.simpleDispFlagTime).toBe(0);
    });

    it('takes the simple time display', () => {
      ChatTabList.instance.simpleDispFlagTime = 1;
      expect(ChatTabList.instance.simpleDispFlagTime).toBe(1);
    });

    it('starts with the simple user display off', () => {
      expect(ChatTabList.instance.simpleDispFlagUserId).toBe(0);
    });
  });

  describe('the system tab', () => {
    it('adds exactly one, under its own identifier', () => {
      const list = ChatTabList.instance;
      list.addChatTab('メイン');

      const system = list.ensureSystemTab();

      expect(system.isSystemTab).toBe(true);
      expect(list.ensureSystemTab()).toBe(system);
      expect(list.chatTabs.filter((tab) => tab.isSystemTab)).toHaveLength(1);
    });

    it('stays the system tab through a rename', () => {
      const list = ChatTabList.instance;
      const system = list.ensureSystemTab();
      system.name = 'お知らせ';

      // It is known by its identifier; known by its name, a rename would make it something else.
      expect(system.isSystemTab).toBe(true);
      expect(list.systemMessageTab).toBe(system);
    });

    it('sends the system messages to that tab', () => {
      const list = ChatTabList.instance;
      const main = list.addChatTab('メイン');
      const system = list.ensureSystemTab();
      list.systemMessageTabIndex = 0;

      // It wins over the tab named by number.
      expect(list.systemMessageTab).toBe(system);
      expect(list.systemMessageTab).not.toBe(main);
    });

    it('falls back to that number in a room that has none', () => {
      const list = ChatTabList.instance;
      list.addChatTab('メイン');
      const sub = list.addChatTab('サブ');
      list.systemMessageTabIndex = 1;

      expect(list.systemMessageTab).toBe(sub);
    });

    it('keeps it out of the conversation tabs', () => {
      const list = ChatTabList.instance;
      const main = list.addChatTab('メイン');
      list.ensureSystemTab();

      expect(list.spokenChatTabs).toEqual([main]);
    });

    it('leaves nobody able to speak in it', () => {
      const system = ChatTabList.instance.ensureSystemTab();

      expect(system.plCanSpeak).toBe(false);
      expect(system.guestCanSpeak).toBe(false);
      expect(system.plCanView).toBe(true);
      expect(canRoleSpeakTab(system, PeerRole.GameMaster)).toBe(false);
    });

    it('sets it right again when it has been made speakable', () => {
      const list = ChatTabList.instance;
      const system = list.ensureSystemTab();
      system.plCanSpeak = true;
      system.name = 'お知らせ';

      list.ensureSystemTab();

      expect(system.plCanSpeak).toBe(false);
      expect(system.name).toBe(SYSTEM_CHAT_TAB_NAME);
    });

    it('keeps it out of the room data', () => {
      const list = ChatTabList.instance;
      list.addChatTab('メイン');
      list.ensureSystemTab();

      const xml = list.toXml();

      expect(xml).toContain('name="メイン"');
      expect(xml).not.toContain(`name="${SYSTEM_CHAT_TAB_NAME}"`);
    });

    it('leaves exactly one of it after a room is loaded', () => {
      const reloadCheck = new ReloadCheck('ReloadCheck');
      reloadCheck.initialize();
      reloadCheck.reloadCheckStart(false);

      const list = ChatTabList.instance;
      list.addChatTab('メインタブ', 'MainTab');
      const system = list.ensureSystemTab();

      // Older room data gives its tabs no identifier, so each load builds them afresh.
      ObjectSerializer.instance.parseXml(
        '<chat-tab-list _systemMessageTabIndex="0">' +
          '<chat-tab name="Main" plCanView="true" plCanSpeak="true"></chat-tab>' +
          '<chat-tab name="Sub" plCanView="true" plCanSpeak="true"></chat-tab>' +
          '</chat-tab-list>'
      );

      const systemTabs = ChatTabList.instance.chatTabs.filter((tab) => tab.isSystemTab);
      expect(systemTabs).toHaveLength(1);
      expect(systemTabs[0]).toBe(system);
      expect(store.get(SYSTEM_CHAT_TAB_IDENTIFIER)).toBe(system);
      expect(ChatTabList.instance.chatTabs.map((tab) => tab.name)).toEqual(['Main', 'Sub', SYSTEM_CHAT_TAB_NAME]);
    });

    it('gathers the notices back into one tab from room data written while it was still exported', () => {
      const reloadCheck = new ReloadCheck('ReloadCheck');
      reloadCheck.initialize();
      reloadCheck.reloadCheckStart(false);

      const list = ChatTabList.instance;
      list.addChatTab('メインタブ', 'MainTab');
      list.ensureSystemTab();

      ObjectSerializer.instance.parseXml(
        '<chat-tab-list _systemMessageTabIndex="0">' +
          '<chat-tab name="Main"></chat-tab>' +
          `<chat-tab name="${SYSTEM_CHAT_TAB_NAME}"></chat-tab>` +
          '</chat-tab-list>'
      );

      expect(ChatTabList.instance.chatTabs.filter((tab) => tab.name === SYSTEM_CHAT_TAB_NAME)).toHaveLength(1);
      expect(ChatTabList.instance.systemMessageTab!.isSystemTab).toBe(true);
    });

    it('survives the same room data being loaded twice over', () => {
      const reloadCheck = new ReloadCheck('ReloadCheck');
      reloadCheck.initialize();
      reloadCheck.reloadCheckStart(false);

      ChatTabList.instance.addChatTab('メインタブ', 'MainTab');
      ChatTabList.instance.ensureSystemTab();

      const roomXml = '<chat-tab-list _systemMessageTabIndex="0"><chat-tab name="Main"></chat-tab></chat-tab-list>';
      ObjectSerializer.instance.parseXml(roomXml);
      ObjectSerializer.instance.parseXml(roomXml);

      const tabs = ChatTabList.instance.chatTabs;
      expect(tabs.map((tab) => tab.name)).toEqual(['Main', SYSTEM_CHAT_TAB_NAME]);
      for (const tab of tabs) expect(store.get(tab.identifier)).toBe(tab);
    });

    it('keeps it out of an export of every tab', () => {
      const list = ChatTabList.instance;
      const main = list.addChatTab('メイン');
      const system = list.ensureSystemTab();
      main.addMessage({ from: 'alice', text: '会話の行', timestamp: 1, tag: '', name: 'アリス', imageIdentifier: '' });
      system.addMessage({
        from: 'System',
        text: '退室の知らせ',
        timestamp: 2,
        tag: 'system-message',
        name: 'システム',
        imageIdentifier: '',
      });

      const html = list.logHtml();
      expect(html).toContain('会話の行');
      expect(html).not.toContain('退室の知らせ');
    });
  });

  describe('the ticker tab', () => {
    it('adds exactly one speakable room tab under its reserved identifier', () => {
      const list = ChatTabList.instance;
      const ticker = list.ensureTickerTab();

      expect(ticker.identifier).toBe(TICKER_CHAT_TAB_IDENTIFIER);
      expect(ticker.name).toBe(TICKER_CHAT_TAB_NAME);
      expect(ticker.isTickerTab).toBe(true);
      expect(ticker.plCanView).toBe(true);
      expect(ticker.plCanSpeak).toBe(true);
      expect(list.ensureTickerTab()).toBe(ticker);
      expect(list.chatTabs.filter((tab) => tab.isTickerTab)).toHaveLength(1);
    });

    it('restores its fixed name and permissions without deleting its log', () => {
      const list = ChatTabList.instance;
      const ticker = list.ensureTickerTab();
      ticker.name = '別名';
      ticker.plCanSpeak = false;
      ticker.addMessage({ name: '案内役', text: '開始', timestamp: 1 });

      list.ensureTickerTab();

      expect(ticker.name).toBe(TICKER_CHAT_TAB_NAME);
      expect(ticker.plCanSpeak).toBe(true);
      expect(ticker.chatMessages).toHaveLength(1);
    });

    it('travels with the room data', () => {
      const list = ChatTabList.instance;
      list.ensureTickerTab();

      const xml = list.toXml();

      expect(xml).toContain(`identifier="${TICKER_CHAT_TAB_IDENTIFIER}"`);
      expect(xml).toContain(`name="${TICKER_CHAT_TAB_NAME}"`);
    });
  });
});
