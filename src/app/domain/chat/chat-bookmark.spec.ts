import { TestBed } from '@angular/core/testing';
import {
  collectChatBookmarks,
  parsePersonalChatBookmarks,
  serializePersonalChatBookmarks,
} from '@axe/domain/chat/chat-bookmark';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { beMyself } from '@axe/testing/peer-context-stub';

describe('chat bookmarks', () => {
  describe('the marks collected from the tabs', () => {
    let tab: ChatTab;

    beforeEach(() => {
      TestBed.configureTestingModule({});
      beMyself('reader');
      tab = new ChatTab();
      tab.initialize();
    });

    afterEach(() => tab.destroy());

    it('are both kinds, in the order the lines were placed, with the names they were given', () => {
      const late = tab.addMessage({ from: 'someone', name: 'ノア', text: '後の発言', timestamp: 2000 });
      const early = tab.addMessage({ from: 'someone', name: 'ノア', text: '先の発言', timestamp: 1000 });
      late.bookmark(1);
      late.renameBookmark('共有の名前');
      const personal = new Map([[early.identifier, { title: '自分の名前', at: 5 }]]);

      const entries = collectChatBookmarks([tab], personal);

      expect(entries.map((entry) => [entry.message, entry.kind, entry.name])).toEqual([
        [early, 'personal', '自分の名前'],
        [late, 'shared', '共有の名前'],
      ]);
    });

    it('leave out a mark of either kind on a line kept from the reader', () => {
      const whisper = tab.addMessage({ from: 'someone', to: 'another', name: 'ノア', text: '内緒', timestamp: 1000 });
      const deleted = tab.addMessage({ from: 'someone', name: 'ノア', text: '消した', timestamp: 2000 });
      whisper.bookmark(1);
      deleted.bookmark(1);
      deleted.pseudoDelete(3000);
      const personal = new Map([
        [whisper.identifier, { title: '', at: 1 }],
        [deleted.identifier, { title: '', at: 1 }],
      ]);

      expect(collectChatBookmarks([tab], personal)).toEqual([]);
    });
  });

  describe('a browser’s personal bookmarks, written out and read back', () => {
    it('come back as they were written', () => {
      const marks = new Map([
        ['line-a', { title: '証言A', at: 2 }],
        ['line-b', { title: '', at: 1 }],
      ]);

      expect(parsePersonalChatBookmarks(serializePersonalChatBookmarks(marks))).toEqual(marks);
    });

    it('keep the newest when there are more than may be kept', () => {
      const marks = new Map([
        ['oldest', { title: '', at: 1 }],
        ['middle', { title: '', at: 2 }],
        ['newest', { title: '', at: 3 }],
      ]);

      const kept = parsePersonalChatBookmarks(serializePersonalChatBookmarks(marks, 2));

      expect([...kept.keys()]).toEqual(['newest', 'middle']);
    });

    it('read nothing from what is not a list, and pass over entries that cannot be read', () => {
      expect(parsePersonalChatBookmarks(null).size).toBe(0);
      expect(parsePersonalChatBookmarks('{').size).toBe(0);
      expect(parsePersonalChatBookmarks('{"id":"x"}').size).toBe(0);

      const marks = parsePersonalChatBookmarks('[null, {"title":"名無し"}, {"id":"ok","title":3,"at":"7"}]');

      expect([...marks.entries()]).toEqual([['ok', { title: '', at: 7 }]]);
    });
  });
});
