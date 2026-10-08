import { TestBed } from '@angular/core/testing';
import {
  CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY,
  ChatPersonalBookmarkStore,
} from '@axe/application/chat/chat-personal-bookmark.store';

describe('ChatPersonalBookmarkStore', () => {
  const fresh = (): ChatPersonalBookmarkStore => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ChatPersonalBookmarkStore);
  };

  beforeEach(() => localStorage.removeItem(CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(CHAT_PERSONAL_BOOKMARKS_STORAGE_KEY));

  it('keeps the marks for the next window', () => {
    const store = fresh();
    store.add('line-a', 1000);
    store.rename('line-a', '  証言A ');

    const next = fresh();

    expect(next.has('line-a')).toBe(true);
    expect(next.all().get('line-a')).toEqual({ title: '証言A', at: 1000 });
  });

  it('forgets a mark taken off', () => {
    const store = fresh();
    store.add('line-a', 1000);

    store.remove('line-a');

    expect(fresh().has('line-a')).toBe(false);
  });

  it('keeps a mark put on twice as it first was', () => {
    const store = fresh();
    store.add('line-a', 1000);
    store.rename('line-a', '証言A');

    store.add('line-a', 2000);

    expect(store.all().get('line-a')).toEqual({ title: '証言A', at: 1000 });
  });

  it('names nothing that is not marked', () => {
    const store = fresh();

    store.rename('line-a', '証言A');

    expect(store.has('line-a')).toBe(false);
  });

  it('still holds the marks for the session when the browser refuses to keep them', () => {
    const store = fresh();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    store.add('line-a', 1000);

    expect(store.has('line-a')).toBe(true);
    vi.restoreAllMocks();
  });
});
