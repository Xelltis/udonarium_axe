import { TestBed } from '@angular/core/testing';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import {
  chatSearchOffsets,
  chatSearchQuery,
  chatSearchText,
  findChatSearchHits,
  isChatSearchShortcut,
} from '@axe/features/chat/chat-search/chat-search';
import { beMyself } from '@axe/testing/peer-context-stub';

describe('chat search', () => {
  const translate = (key: string) => `[${key}]`;
  let tab: ChatTab;

  function say(text: string, extra: Record<string, string> = {}): ChatMessage {
    return tab.addMessage({ from: 'someone', name: 'アリス', text, timestamp: tab.chatMessages.length + 1, ...extra });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    beMyself('reader');
    tab = new ChatTab();
    tab.initialize();
  });

  afterEach(() => tab.destroy());

  describe('what is looked for', () => {
    it('is compared half-width and in lower case, as one phrase', () => {
      expect(chatSearchQuery('  ＡｂＣ ｄ ')).toBe('abc d');
    });
  });

  describe('what a line is found by', () => {
    it('is the name it is shown under and its words', () => {
      const text = chatSearchText(say('松明を灯す'), false, translate);

      expect(text).toContain('アリス');
      expect(text).toContain('松明を灯す');
    });

    it('reads ruby as the words with their reading after them', () => {
      expect(chatSearchText(say('|魔法《まほう》を使う'), false, translate)).toContain('魔法（まほう）を使う');
    });

    it('leaves out the words of somebody else’s secret roll', () => {
      const secret = say('隠しダイス → 6', { tag: 'secret' });

      expect(chatSearchText(secret, false, translate)).not.toContain('隠しダイス');
      expect(chatSearchText(secret, true, translate)).toContain('隠しダイス');
    });

    it('keeps the words of the reader’s own secret roll', () => {
      const mine = say('隠しダイス → 6', { tag: 'secret', from: 'reader' });

      expect(chatSearchText(mine, false, translate)).toContain('隠しダイス');
    });
  });

  describe('the lines found', () => {
    const textOf = (message: ChatMessage) => chatSearchText(message, false, translate);

    it('are those holding the phrase, oldest first, whatever the width or case it was typed in', () => {
      const first = say('ゴブリンが3体いる');
      say('何もない部屋');
      const last = say('ＧＯＢＬＩＮ ゴブリン');

      expect(findChatSearchHits(tab.chatMessages, chatSearchQuery('ゴブリン'), textOf)).toEqual([first, last]);
      expect(findChatSearchHits(tab.chatMessages, chatSearchQuery('goblin'), textOf)).toEqual([last]);
    });

    it('are none while nothing is looked for', () => {
      say('ゴブリン');

      expect(findChatSearchHits(tab.chatMessages, '', textOf)).toEqual([]);
    });

    it('leave out a line said to somebody else', () => {
      say('合言葉はゴブリン', { to: 'another' });
      const toMe = say('ゴブリンに注意', { to: 'reader' });

      expect(findChatSearchHits(tab.chatMessages, chatSearchQuery('ゴブリン'), textOf)).toEqual([toMe]);
    });

    it('leave out a deleted line, whoever deleted it', () => {
      say('ゴブリンを見た気がする').pseudoDelete(1000);
      say('ゴブリンは見間違い', { from: 'reader' }).pseudoDelete(1000);
      const kept = say('ゴブリンが逃げた');

      expect(findChatSearchHits(tab.chatMessages, chatSearchQuery('ゴブリン'), textOf)).toEqual([kept]);
    });

    it('can be found by the name they are shown under', () => {
      const line = say('こんにちは');

      expect(findChatSearchHits(tab.chatMessages, chatSearchQuery('アリス'), textOf)).toEqual([line]);
    });
  });

  describe('where the phrase falls in a run of text', () => {
    it('is every place it falls, in the text as it is', () => {
      expect(chatSearchOffsets('Ａb ab AB', 'ab')).toEqual([
        [0, 2],
        [3, 5],
        [6, 8],
      ]);
    });

    it('is nowhere while nothing is looked for', () => {
      expect(chatSearchOffsets('abc', '')).toEqual([]);
    });
  });

  describe('the key that opens the search', () => {
    const press = (init: KeyboardEventInit) => isChatSearchShortcut(new KeyboardEvent('keydown', init));

    it('is Ctrl+F, or ⌘F on a Mac', () => {
      expect(press({ key: 'f', code: 'KeyF', ctrlKey: true })).toBe(true);
      expect(press({ key: 'F', code: 'KeyF', ctrlKey: true })).toBe(true);
      expect(press({ key: 'f', code: 'KeyF', metaKey: true })).toBe(true);
    });

    it('is the F key where it sits on a keyboard that types another letter there', () => {
      expect(press({ key: 'ㄹ', code: 'KeyF', ctrlKey: true })).toBe(true);
    });

    it('is not F alone, nor F with Shift or Alt', () => {
      expect(press({ key: 'f', code: 'KeyF' })).toBe(false);
      expect(press({ key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true })).toBe(false);
      expect(press({ key: 'f', code: 'KeyF', ctrlKey: true, altKey: true })).toBe(false);
      expect(press({ key: 'g', code: 'KeyG', ctrlKey: true })).toBe(false);
    });
  });
});
