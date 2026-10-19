import { emitLoadConfig, loadConfig$ } from '@axe/core/event/domain-events';
import { SyncObject } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';

@SyncObject('test-setup-leftover')
class Leftover extends GameObject {}

describe('the shared test setup', () => {
  it('hands each test an empty object store', () => {
    expect(ObjectStore.instance.getObjects()).toHaveLength(0);

    const leftover = new Leftover('test-setup-leftover-identifier');
    leftover.initialize();

    expect(ObjectStore.instance.getObjects()).toHaveLength(1);
  });

  it('does not carry what the last test made into this one', () => {
    expect(ObjectStore.instance.getObjects()).toHaveLength(0);
  });

  it('takes a chat tab, which the list keeps as a child rather than as an entry of the store', () => {
    ChatTabList.instance.addChatTab('置き去り');

    expect(ChatTabList.instance.chatTabs.map((tab) => tab.name)).toContain('置き去り');
  });

  it('hands the next test none of the tabs the one before it left', () => {
    expect(ChatTabList.instance.chatTabs.map((tab) => tab.name)).not.toContain('置き去り');
  });

  it('frees a fixed identifier again, so registering it twice still takes', () => {
    const first = new Leftover('test-setup-fixed-identifier');
    first.initialize();

    expect(ObjectStore.instance.get('test-setup-fixed-identifier')).toBe(first);
  });

  it('registers the same fixed identifier in the next test', () => {
    const second = new Leftover('test-setup-fixed-identifier');
    second.initialize();

    expect(ObjectStore.instance.get('test-setup-fixed-identifier')).toBe(second);
  });

  it('takes a configuration announced, which the channel replays to later listeners', () => {
    emitLoadConfig({ config: { announcedBy: 'an earlier test' } });

    const heard: unknown[] = [];
    loadConfig$.subscribe((event) => heard.push(event.config))();
    expect(heard).toEqual([{ announcedBy: 'an earlier test' }]);
  });

  it('replays to the next test none of the configuration the one before it announced', () => {
    const heard: unknown[] = [];
    loadConfig$.subscribe((event) => heard.push(event.config))();

    expect(heard).toEqual([]);
  });

  it('leaves the page where it is when a spec clicks a link, as saving a file does', () => {
    const before = location.href;
    const link = document.createElement('a');
    link.href = 'blob:http://localhost/left-behind';
    link.download = 'room.zip';
    link.click();

    expect(location.href).toBe(before);
  });

  it('puts the page back where it was for the next test, should anything have moved it', () => {
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL('blob:http://localhost/moved');
  });

  it('starts each test at the page’s own address, so relative addresses resolve', () => {
    expect(location.href.startsWith('blob:')).toBe(false);
    expect(new URL('assets/login-callback.html', document.baseURI).pathname).toMatch(/assets\/login-callback\.html$/);
  });
});
