import { TestBed } from '@angular/core/testing';
import { ChatBookmarkService } from '@axe/application/chat/chat-bookmark.service';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatBookmarkService', () => {
  let service: ChatBookmarkService;
  let tabs: ChatTab[];

  const beSeat = (role: PeerRole) => {
    PeerCursor.myCursor = { role, isGameMaster: role === PeerRole.GameMaster } as PeerCursor;
  };

  const addTab = (name: string): ChatTab => {
    const tab = ChatTabList.instance.addChatTab(name);
    tabs.push(tab);
    return tab;
  };

  /** Changes reach the signals a microtask later, as they do in the room. */
  const settle = () => Promise.resolve();

  const say = (tab: ChatTab, text: string, timestamp: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
    tab.addMessage({ from: 'someone', name: 'ノア', text, timestamp, ...extra });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    beMyself('me');
    beSeat(PeerRole.Player);
    tabs = [];
    service = TestBed.inject(ChatBookmarkService);
  });

  afterEach(() => {
    for (const tab of tabs) tab.destroy();
    vi.restoreAllMocks();
  });

  it('lists the marked lines of every tab in the order they were said', () => {
    const main = addTab('メイン');
    const side = addTab('雑談');
    const first = say(main, '証言A', 1000);
    say(main, 'ただの相槌', 2000);
    const second = say(side, '証言B', 1500);
    const third = say(main, '証言C', 3000);

    service.add(third);
    service.add(first);
    service.add(second);

    expect(service.entries().map((entry) => entry.message)).toEqual([first, second, third]);
    expect(service.entries()[1].tab).toBe(side);
  });

  it('drops a mark as soon as its line is gone', async () => {
    const main = addTab('メイン');
    const line = say(main, '証言A', 1000);
    service.add(line);
    expect(service.entries()).toHaveLength(1);

    line.destroy();
    await settle();

    expect(service.entries()).toHaveLength(0);
  });

  it('drops the marks of a log that was cleared', async () => {
    const main = addTab('メイン');
    service.add(say(main, '証言A', 1000));
    service.add(say(main, '証言B', 2000));
    expect(service.entries()).toHaveLength(2);

    while (main.children.length > 0) main.children[0].destroy();
    await settle();

    expect(service.entries()).toHaveLength(0);
  });

  it('keeps the mark on a whisper from those it was not whispered to', () => {
    const main = addTab('メイン');
    const whisper = say(main, '内緒の話', 1000, { to: 'third' } as Partial<ChatMessage>);

    whisper.bookmark(1000);

    expect(service.entries()).toHaveLength(0);
  });

  it('keeps the mark on a line whispered afterwards from those it was not whispered to, and shows it again once it is put back', async () => {
    const main = addTab('メイン');
    const line = say(main, '証言A', 1000);
    service.add(line);
    expect(service.entries()).toHaveLength(1);

    line.makeAfterWhisper('third', 'サード', 2000);
    await settle();
    expect(service.entries()).toHaveLength(0);

    line.undoAfterWhisper();
    await settle();
    expect(service.entries()).toHaveLength(1);
  });

  it('drops the mark of a deleted line from the list', async () => {
    const main = addTab('メイン');
    const line = say(main, '証言A', 1000);
    service.add(line);
    expect(service.entries()).toHaveLength(1);

    line.pseudoDelete(2000);
    await settle();

    expect(service.entries()).toHaveLength(0);
  });

  it('leaves out the tabs the reader may not read', () => {
    const secret = addTab('GM専用');
    secret.plCanView = false;
    const line = say(secret, '黒幕の名前', 1000);
    line.bookmark(1000);

    expect(service.entries()).toHaveLength(0);
  });

  it('shows the game master the marks in a tab kept from the players', () => {
    beSeat(PeerRole.GameMaster);
    const secret = addTab('GM専用');
    secret.plCanView = false;
    secret.addMessage({ from: 'someone', name: 'GM', text: '黒幕の名前', timestamp: 1000 }).bookmark(1000);

    expect(service.entries()).toHaveLength(1);
  });

  it('lets a guest follow the marks but not change them', () => {
    const main = addTab('メイン');
    const line = say(main, '証言A', 1000);
    line.bookmark(1000);
    const other = say(main, '証言B', 2000);
    beSeat(PeerRole.Guest);

    service.add(other);
    service.rename(line, '書き換え');
    service.remove(line);

    expect(service.canEdit).toBe(false);
    expect(other.isBookmarked).toBe(false);
    expect(line.bookmarkName).toBe('');
    expect(line.isBookmarked).toBe(true);
    expect(service.entries()).toHaveLength(1);
  });

  it('names a mark, and goes back to the line’s own words when the name is emptied', () => {
    const main = addTab('メイン');
    const line = say(main, '証言A', 1000);
    service.add(line);

    service.rename(line, '事件の証言A');
    expect(line.bookmarkName).toBe('事件の証言A');

    service.rename(line, '');
    expect(line.bookmarkName).toBe('');
  });

  it('does not mark a notice meant for the reader alone, or a line in no tab', () => {
    const main = addTab('メイン');
    const notice = say(main, 'あなたにだけのお知らせ', 1000, { tag: 'to-pl-system-message' } as Partial<ChatMessage>);
    const loose = new ChatMessage();
    loose.initialize();

    expect(service.canBookmark(notice)).toBe(false);
    expect(service.canBookmark(loose)).toBe(false);
    loose.destroy();
  });

  it('takes a mark off with the same toggle that put it on', () => {
    const main = addTab('メイン');
    const line = say(main, '証言A', 1000);

    service.toggle(line);
    expect(line.isBookmarked).toBe(true);
    service.toggle(line);
    expect(line.isBookmarked).toBe(false);
  });
});
