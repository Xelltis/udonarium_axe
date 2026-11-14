import { TestBed } from '@angular/core/testing';
import { VisibleChatTabsService } from '@axe/application/chat/visible-chat-tabs.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VisibleChatTabsService', () => {
  let service: VisibleChatTabsService;
  let objectChange: ObjectChangeService;
  const original = PeerCursor.myCursor;

  function beRole(role: PeerRole): void {
    PeerCursor.myCursor = { role, identifier: 'me' } as PeerCursor;
    objectChange.notifyCollectionChanged(PeerCursor.aliasName);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(VisibleChatTabsService);
    objectChange = TestBed.inject(ObjectChangeService);
  });

  afterEach(() => {
    PeerCursor.myCursor = original;
    for (const tab of [...ChatTabList.instance.chatTabs]) {
      if (!tab.isSystemTab) tab.destroy();
    }
  });

  it('lists a tab as the room gets it, in the order the room lists them', () => {
    beRole(PeerRole.GameMaster);
    const before = service.tabs().length;

    const main = ChatTabList.instance.addChatTab('メイン');
    const sub = ChatTabList.instance.addChatTab('雑談');

    const tabs = service.tabs();
    expect(tabs.length).toBe(before + 2);
    expect(tabs.indexOf(main)).toBeLessThan(tabs.indexOf(sub));
  });

  it('leaves out a tab the reader may not read, and takes it in again once they may', () => {
    beRole(PeerRole.Player);
    const secret = ChatTabList.instance.addChatTab('GM用');
    expect(service.tabs()).toContain(secret);

    secret.plCanView = false;
    objectChange.notifyChanged(secret.identifier);
    expect(service.tabs()).not.toContain(secret);

    beRole(PeerRole.GameMaster);
    expect(service.tabs()).toContain(secret);
  });

  it('gives a new list when a tab in it changes, so what is drawn from the tab is drawn again', () => {
    beRole(PeerRole.GameMaster);
    const tab = ChatTabList.instance.addChatTab('メイン');
    const first = service.tabs();

    objectChange.notifyChanged(tab.identifier);

    expect(service.tabs()).not.toBe(first);
    expect(service.tabs()).toEqual(first);
  });
});
