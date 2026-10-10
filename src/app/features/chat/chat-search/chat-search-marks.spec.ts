import {
  CHAT_SEARCH_CURRENT_ATTRIBUTE,
  CHAT_SEARCH_CURRENT_HIGHLIGHT,
  CHAT_SEARCH_HIGHLIGHT,
  markChatSearch,
  unmarkChatSearch,
} from '@axe/features/chat/chat-search/chat-search-marks';

describe('chat search marks', () => {
  let log: HTMLElement;

  function line(identifier: string, name: string, words: string): HTMLElement {
    const element = document.createElement('chat-message');
    element.dataset['messageId'] = identifier;
    element.innerHTML = `<div><div><span class="msg-name">${name}</span><button><i class="material-icons">reply</i></button><span data-chat-search-text>${words}</span></div></div>`;
    log.appendChild(element);
    return element;
  }

  beforeEach(() => {
    log = document.createElement('div');
    document.body.appendChild(log);
  });

  afterEach(() => {
    unmarkChatSearch(log);
    log.remove();
  });

  it('picks out the line the search stands on, and no other', () => {
    const first = line('a', 'アリス', '松明');
    const second = line('b', 'ボブ', '松明を消す');

    markChatSearch(log, '松明', 'b');

    expect(first.hasAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE)).toBe(false);
    expect(second.hasAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE)).toBe(true);
  });

  it('lets go of the line once nothing is looked for, or the marks are taken away', () => {
    const only = line('a', 'アリス', '松明');
    markChatSearch(log, '松明', 'a');

    markChatSearch(log, '', 'a');
    expect(only.hasAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE)).toBe(false);

    markChatSearch(log, '松明', 'a');
    unmarkChatSearch(log);
    expect(only.hasAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE)).toBe(false);
  });

  describe('in a browser that marks words', () => {
    class FakeHighlight {
      readonly ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    let registry: Map<string, FakeHighlight>;
    const marked = (name: string) => (registry.get(name)?.ranges ?? []).map((range) => range.toString());

    beforeEach(() => {
      registry = new Map();
      vi.stubGlobal('Highlight', FakeHighlight);
      vi.stubGlobal('CSS', { highlights: registry });
    });

    afterEach(() => {
      unmarkChatSearch(log);
      vi.unstubAllGlobals();
    });

    it('marks the words in the names and the lines, the current line’s apart', () => {
      line('a', 'たいまつ番', '松明を灯す');
      line('b', 'ボブ', '松明と松明');

      markChatSearch(log, '松明', 'b');

      expect(marked(CHAT_SEARCH_HIGHLIGHT)).toEqual(['松明']);
      expect(marked(CHAT_SEARCH_CURRENT_HIGHLIGHT)).toEqual(['松明', '松明']);
    });

    it('marks a name, but never the name of a button’s icon', () => {
      line('a', 'Reply', 'replying');

      markChatSearch(log, 'reply', null);

      expect(marked(CHAT_SEARCH_HIGHLIGHT)).toEqual(['Reply', 'reply']);
    });

    it('takes every mark away once closed', () => {
      line('a', 'アリス', '松明');
      markChatSearch(log, '松明', 'a');

      unmarkChatSearch(log);

      expect(registry.size).toBe(0);
    });

    it('keeps the marks of another log on the same page', () => {
      const other = document.createElement('div');
      document.body.appendChild(other);
      const elsewhere = document.createElement('chat-message');
      elsewhere.dataset['messageId'] = 'x';
      elsewhere.innerHTML = '<span data-chat-search-text>松明</span>';
      other.appendChild(elsewhere);
      line('a', 'アリス', '松明');

      markChatSearch(other, '松明', null);
      markChatSearch(log, '松明', null);
      unmarkChatSearch(log);

      expect(marked(CHAT_SEARCH_HIGHLIGHT)).toEqual(['松明']);
      unmarkChatSearch(other);
      other.remove();
    });
  });
});
