import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/index';
import { IPeerContext } from '@axe/core/network/peer-context';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';

describe('ChatMessage', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;

    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({
      peerId: 'test-peer',
      userId: 'test-user',
      isOpen: true,
    } as IPeerContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unedited', () => {
      const msg = new ChatMessage();
      msg.initialize();
      expect(msg.fixd).toBe(false);
    });
  });

  describe('text getter/setter', () => {
    it('holds its text', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.text = 'テストメッセージ';
      expect(msg.text).toBe('テストメッセージ');
    });
  });

  describe('attachmentImageIdentifierList', () => {
    it('reads the attached pictures out of the field', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.attachmentImageIdentifiers = JSON.stringify(['image-a', ' image-b ']);

      expect(msg.attachmentImageIdentifierList).toEqual(['image-a', 'image-b']);
    });
  });

  describe('timestamp', () => {
    it('returns one when the attribute is unset', () => {
      const msg = new ChatMessage();
      msg.initialize();
      const ts = msg.timestamp;
      expect(typeof ts).toBe('number');
    });

    it('returns the value it is given', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.setAttribute('timestamp', 1234567890);
      expect(msg.timestamp).toBe(1234567890);
    });
  });

  describe('sendTo', () => {
    it('returns nobody for an empty address', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = '';
      expect(msg.sendTo).toEqual([]);
    });

    it('reads them apart by their spaces', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'user1 user2';
      expect(msg.sendTo).toEqual(['user1', 'user2']);
    });
  });

  describe('tags', () => {
    it('returns nothing for an empty tag', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.tag = '';
      expect(msg.tags).toEqual([]);
    });

    it('reads them apart by their spaces', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.tag = 'system secret';
      expect(msg.tags).toEqual(['system', 'secret']);
    });
  });

  describe('isDirect', () => {
    it('is false when it is addressed to nobody', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = '';
      expect(msg.isDirect).toBe(false);
    });

    it('is true when it is addressed to somebody', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'user1';
      expect(msg.isDirect).toBe(true);
    });
  });

  describe('isSendFromSelf', () => {
    it('is true for a message you sent', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'test-user';
      expect(msg.isSendFromSelf).toBe(true);
    });

    it('is false for one somebody else did', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'other-user';
      expect(msg.isSendFromSelf).toBe(false);
    });

    it('is true when you were the original sender', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'other-user';
      msg.originFrom = 'test-user';
      expect(msg.isSendFromSelf).toBe(true);
    });
  });

  describe('isSystem', () => {
    it('is true for a message tagged as the systems', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.tag = 'system';
      expect(msg.isSystem).toBe(true);
    });

    it('is false for one that is not', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.tag = 'normal';
      expect(msg.isSystem).toBe(false);
    });
  });

  describe('isDicebot', () => {
    it('is true for one from the dice bot', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.tag = 'system';
      msg.from = 'System-BCDice';
      expect(msg.isDicebot).toBe(true);
    });
  });

  describe('isSecret', () => {
    it('is true for one tagged secret', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.tag = 'secret';
      expect(msg.isSecret).toBe(true);
    });
  });

  describe('isDisplayable', () => {
    it('is true for a message addressed to nobody', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = '';
      expect(msg.isDisplayable).toBe(true);
    });

    it('is true for one addressed to you', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'test-user';
      msg.from = 'other-user';
      expect(msg.isDisplayable).toBe(true);
    });

    it('is false for one addressed to somebody else', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'other-user';
      msg.from = 'third-user';
      expect(msg.isDisplayable).toBe(false);
    });
  });

  describe('changeable', () => {
    it('is true for an ordinary message you sent', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'test-user';
      msg.name = 'テストキャラ';
      expect(msg.changeable).toBe(true);
    });

    it('is false for one tagged as the systems, even from you', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'test-user';
      msg.tag = 'system-message';
      expect(msg.changeable).toBe(false);
    });

    it('is false for one tagged as addressed to a player', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'test-user';
      msg.tag = 'DiceBot to-pl-system-message';
      expect(msg.changeable).toBe(false);
    });

    it('is false for one sent by the system', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'System';
      expect(msg.changeable).toBe(false);
    });

    it('is false for one somebody else sent', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'other-user';
      msg.name = 'テスト';
      expect(msg.changeable).toBe(false);
    });
  });

  describe('isSentBy', () => {
    it('is true when the sender matches', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'user-A';
      expect(msg.isSentBy('user-A')).toBe(true);
    });

    it('is true when the original sender does', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'other';
      msg.originFrom = 'user-A';
      expect(msg.isSentBy('user-A')).toBe(true);
    });

    it('is false when neither does', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'user-A';
      msg.originFrom = 'user-B';
      expect(msg.isSentBy('user-C')).toBe(false);
    });
  });

  describe('isRelatedTo', () => {
    it('is true for somebody it is addressed to', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'user-A user-B';
      msg.from = 'sender';
      expect(msg.isRelatedTo('user-A')).toBe(true);
    });

    it('is true for the sender', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'target';
      msg.from = 'user-A';
      expect(msg.isRelatedTo('user-A')).toBe(true);
    });

    it('is false for anybody else', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'target';
      msg.from = 'sender';
      expect(msg.isRelatedTo('user-C')).toBe(false);
    });
  });

  describe('isDisplayableTo', () => {
    it('is true for everybody on a message addressed to nobody', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = '';
      expect(msg.isDisplayableTo('anyone')).toBe(true);
    });

    it('is true for somebody an addressed message concerns', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'user-A';
      msg.from = 'user-B';
      expect(msg.isDisplayableTo('user-A')).toBe(true);
    });

    it('is false for anybody it does not', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.to = 'user-A';
      msg.from = 'user-B';
      expect(msg.isDisplayableTo('user-C')).toBe(false);
    });
  });

  describe('isChangeableBy', () => {
    it('is true when the sender matches and it carries no system tag', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'user-A';
      msg.name = 'キャラ名';
      expect(msg.isChangeableBy('user-A')).toBe(true);
    });

    it('is false when it is tagged as the systems', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'user-A';
      msg.tag = 'system-message';
      expect(msg.isChangeableBy('user-A')).toBe(false);
    });

    it('is false when it is tagged as addressed to a player', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'user-A';
      msg.tag = 'DiceBot to-pl-system-message';
      expect(msg.isChangeableBy('user-A')).toBe(false);
    });

    it('is false when the sender does not match', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.from = 'user-A';
      msg.name = 'キャラ名';
      expect(msg.isChangeableBy('user-B')).toBe(false);
    });
  });

  describe('XML round-trip', () => {
    it('writes the reply and the quotation out as attributes and reads them back', () => {
      const msg = new ChatMessage();
      msg.initialize();
      msg.replyTo = 'msg-target-1';
      msg.quoteOf = 'msg-quote-1';
      msg.name = '自分';
      msg.text = 'コメント';

      const xml = msg.toXml();
      expect(xml).toContain('replyTo="msg-target-1"');
      expect(xml).toContain('quoteOf="msg-quote-1"');

      // and keeps them through a reparse
      store.delete(msg, false);
      store.clearDeleteHistory();
      const restored = ObjectSerializer.instance.parseXml(xml) as ChatMessage;
      expect(restored).toBeInstanceOf(ChatMessage);
      expect(restored.replyTo).toBe('msg-target-1');
      expect(restored.quoteOf).toBe('msg-quote-1');
    });

    it('keeps the identifiers in the saved data, so the message replied to can still be found after a reload', () => {
      const target = new ChatMessage();
      target.initialize();
      target.name = '相手';
      target.text = '元の発言';
      const targetId = target.identifier;

      const reply = new ChatMessage();
      reply.initialize();
      reply.replyTo = targetId;
      reply.name = '自分';
      reply.text = '返事';

      const targetXml = target.toXml();
      const replyXml = reply.toXml();

      // both identifiers are written out as attributes
      expect(targetXml).toContain(`identifier="${targetId}"`);
      expect(replyXml).toContain(`identifier="${reply.identifier}"`);

      // the store is emptied before it is read, as loading an archive would
      store.delete(target, false);
      store.delete(reply, false);
      store.clearDeleteHistory();

      const restoredTarget = ObjectSerializer.instance.parseXml(targetXml) as ChatMessage;
      const restoredReply = ObjectSerializer.instance.parseXml(replyXml) as ChatMessage;

      expect(restoredTarget.identifier).toBe(targetId);
      expect(restoredReply.replyTo).toBe(targetId);
      // with the identifiers kept, the link can be made again
      expect(restoredReply.replyToMessage).toBe(restoredTarget);
    });
  });

  describe('where a line sits among the others', () => {
    const reload = (message: ChatMessage): ChatMessage => {
      const xml = message.toXml();
      store.delete(message, false);
      store.clearDeleteHistory();
      return ObjectSerializer.instance.parseXml(xml) as ChatMessage;
    };

    it('keeps an opened line behind a later one after it is read back from xml', () => {
      const opened = new ChatMessage();
      opened.initialize();
      opened.setAttribute('timestamp', 1000);
      opened.disclosedAt = 5000;
      const later = new ChatMessage();
      later.initialize();
      later.setAttribute('timestamp', 2000);

      // as a save writes them, the opened line last
      const reloadedLater = reload(later);
      const reloadedOpened = reload(opened);

      const tab = new ChatTab();
      tab.initialize();
      try {
        tab.appendChild(reloadedLater);
        tab.appendChild(reloadedOpened);

        expect(tab.chatMessages[tab.chatMessages.length - 1]).toBe(reloadedOpened);
      } finally {
        tab.destroy();
      }
    });

    it('reads a time of opening that came back as text as a number', () => {
      const message = new ChatMessage();
      message.initialize();
      message.setAttribute('timestamp', 1000);
      message.setAttribute('disclosedAt', '5000');

      expect(message.placedAt).toBe(5000);
      expect(typeof message.index).toBe('number');
    });
  });

  describe('what was rolled', () => {
    it('reads the roll and whether it succeeded', () => {
      const message = new ChatMessage();
      message.from = 'System-BCDice';
      message.tag = 'system';
      message.dicebot = '{"system":"DiceBot","faces":[{"sides":6,"value":5,"kind":"normal"}],"outcome":"success"}';

      expect(message.isDicebot).toBe(true);
      expect(message.rollDetail).toMatchObject({ system: 'DiceBot', outcome: 'success' });
      expect(message.rollDetail?.faces).toHaveLength(1);
    });

    it('reads nothing from a message written before that was recorded', () => {
      // The same field in older room data may hold something else, which is not thrown away.
      const message = new ChatMessage();
      message.from = 'System-BCDice';
      message.dicebot = 'Cthulhu7th';

      expect(message.rollDetail).toBeNull();
    });
  });

  describe('an after-the-fact whisper', () => {
    const reload = (message: ChatMessage): ChatMessage => {
      const xml = message.toXml();
      store.delete(message, false);
      store.clearDeleteHistory();
      return ObjectSerializer.instance.parseXml(xml) as ChatMessage;
    };

    const said = (from: string, to = ''): ChatMessage => {
      const message = new ChatMessage();
      message.initialize();
      message.from = from;
      message.name = 'アリア';
      if (to) message.to = to;
      message.text = '本当はノアにだけ言いたかった';
      return message;
    };

    it('becomes a whisper like any other, reaching the one it is whispered to and its speaker alone', () => {
      const message = said('speaker');

      message.makeAfterWhisper('test-user', 'ノア', 1000);

      expect(message.isAfterWhisper).toBe(true);
      expect(message.name).toBe('アリア > ノア');
      expect(message.isDirect).toBe(true);
      expect(message.isDisplayable).toBe(true);
      expect(message.isDisplayableTo('speaker')).toBe(true);
      expect(message.isDisplayableTo('third-user')).toBe(false);
    });

    it('is a whisper to an older version too, which knows nothing of it', () => {
      const message = said('speaker');

      message.makeAfterWhisper('test-user', 'ノア', 1000);

      expect(message.to).toBe('test-user');
    });

    it('says the line to everyone again when put back, under its own name, leaving nothing of having been one', () => {
      const message = said('speaker');
      message.makeAfterWhisper('test-user', 'ノア', 1000);

      message.undoAfterWhisper();

      expect(message.isAfterWhisper).toBe(false);
      expect(message.isDirect).toBe(false);
      expect(message.name).toBe('アリア');
      const xml = message.toXml();
      expect(xml).not.toContain('afterWhisperAt');
      expect(xml).not.toContain('afterWhisperTo');
      expect(xml).not.toContain('afterWhisperName');
    });

    it('can be whispered to somebody else, named after them, and still goes back to everyone', () => {
      const message = said('speaker');
      message.makeAfterWhisper('second-user', 'ミナ', 1000);

      message.makeAfterWhisper('test-user', 'ノア', 2000);
      expect(message.to).toBe('test-user');
      expect(message.name).toBe('アリア > ノア');
      expect(Number(message.afterWhisperAt)).toBe(1000);

      message.undoAfterWhisper();
      expect(message.to).toBe('');
      expect(message.name).toBe('アリア');
    });

    it('changes nothing without anyone to whisper to', () => {
      const message = said('speaker');

      message.makeAfterWhisper('', 'ノア', 1000);

      expect(message.isAfterWhisper).toBe(false);
      expect(message.name).toBe('アリア');
    });

    it('stays one through a save, and can still be put back after it', () => {
      const message = said('speaker');
      message.makeAfterWhisper('test-user', 'ノア', 1000);

      const reloaded = reload(message);

      expect(reloaded.isAfterWhisper).toBe(true);
      reloaded.undoAfterWhisper();
      expect(reloaded.to).toBe('');
      expect(reloaded.name).toBe('アリア');
    });

    it('reads a line from a room saved before there were any as an ordinary line', () => {
      const message = new ChatMessage();
      message.initialize();
      message.setAttribute('afterWhisperAt', '');

      expect(message.isAfterWhisper).toBe(false);
    });
  });

  describe('a deleted line', () => {
    const reload = (message: ChatMessage): ChatMessage => {
      const xml = message.toXml();
      store.delete(message, false);
      store.clearDeleteHistory();
      return ObjectSerializer.instance.parseXml(xml) as ChatMessage;
    };

    const said = (from: string): ChatMessage => {
      const message = new ChatMessage();
      message.initialize();
      message.from = from;
      message.text = '言わなかったことにしたい';
      return message;
    };

    it('is gone from everybody’s chat, the chat of the one who said it included', () => {
      const theirs = said('someone');
      const mine = said('test-user');

      theirs.pseudoDelete(1000);
      mine.pseudoDelete(1000);

      expect(theirs.isShownInChat).toBe(false);
      expect(mine.isShownInChat).toBe(false);
    });

    it('is still in the room, for the log and the saved room to keep', () => {
      const message = said('someone');

      message.pseudoDelete(1000);

      expect(message.isDisplayable).toBe(true);
      expect(message.isDirect).toBe(false);
      expect(reload(message).isPseudoDeleted).toBe(true);
    });

    it('keeps the moment it was first deleted', () => {
      const message = said('someone');
      message.pseudoDelete(1000);
      message.pseudoDelete(2000);

      expect(Number(message.pseudoDeletedAt)).toBe(1000);
    });

    it('is not shown a whisper the reader was not part of, deleted or not', () => {
      const message = said('someone');
      message.to = 'third-user';

      expect(message.isShownInChat).toBe(false);
    });

    it('reads a line from a room saved before there were any as not deleted', () => {
      const message = new ChatMessage();
      message.initialize();
      message.setAttribute('pseudoDeletedAt', '');

      expect(message.isPseudoDeleted).toBe(false);
      expect(message.isShownInChat).toBe(true);
    });
  });

  describe('marking a line to find again', () => {
    const reload = (message: ChatMessage): ChatMessage => {
      const xml = message.toXml();
      store.delete(message, false);
      store.clearDeleteHistory();
      return ObjectSerializer.instance.parseXml(xml) as ChatMessage;
    };

    it('starts unmarked, and a room saved before marks reads as unmarked', () => {
      const message = new ChatMessage();
      message.initialize();
      expect(message.isBookmarked).toBe(false);

      message.setAttribute('bookmarkedAt', '');
      expect(message.isBookmarked).toBe(false);
      expect(message.bookmarkName).toBe('');
    });

    it('keeps the mark and its name through a save', () => {
      const message = new ChatMessage();
      message.initialize();
      message.bookmark(1000);
      message.renameBookmark('  事件の証言A ');

      const reloaded = reload(message);

      expect(reloaded.isBookmarked).toBe(true);
      expect(reloaded.bookmarkName).toBe('事件の証言A');
    });

    it('keeps the moment it was first marked', () => {
      const message = new ChatMessage();
      message.initialize();
      message.bookmark(1000);
      message.bookmark(2000);

      expect(Number(message.bookmarkedAt)).toBe(1000);
    });

    it('keeps the name when the mark is taken off, so putting it back finds the name again', () => {
      const message = new ChatMessage();
      message.initialize();
      message.bookmark(1000);
      message.renameBookmark('事件の証言A');

      message.unbookmark();
      expect(message.isBookmarked).toBe(false);
      message.bookmark(2000);

      expect(message.bookmarkName).toBe('事件の証言A');
    });

    it('goes back to being named after the line when the name is emptied', () => {
      const message = new ChatMessage();
      message.initialize();
      message.renameBookmark('事件の証言A');

      message.renameBookmark('   ');

      expect(message.bookmarkName).toBe('');
      expect(message.toXml()).not.toContain('bookmarkTitle');
    });

    it('reads a name that came back as a number as text', () => {
      const message = new ChatMessage();
      message.initialize();
      message.setAttribute('bookmarkTitle', 42);

      expect(message.bookmarkName).toBe('42');
    });

    it('does not mark the line as edited', () => {
      const message = new ChatMessage();
      message.initialize();
      message.bookmark(1000);
      message.renameBookmark('証言');

      expect(message.fixd).toBe(false);
    });
  });

  describe('editing a line', () => {
    const reload = (message: ChatMessage): ChatMessage => {
      const xml = message.toXml();
      store.delete(message, false);
      store.clearDeleteHistory();
      return ObjectSerializer.instance.parseXml(xml) as ChatMessage;
    };

    const said = (text: string): ChatMessage => {
      const message = new ChatMessage();
      message.initialize();
      message.setAttribute('timestamp', 1000);
      message.text = text;
      return message;
    };

    it('keeps every wording it has had, with when each began, and marks it as edited', () => {
      const message = said('こんばんわ');

      message.edit('こんばんは', '', 2000);
      message.edit('こんばんは！', '', 3000);

      expect(message.fixd).toBe(true);
      expect(message.versions).toEqual([
        { text: 'こんばんわ', since: 1000, edit: 0 },
        { text: 'こんばんは', since: 2000, edit: 1 },
        { text: 'こんばんは！', since: 3000, edit: 2 },
      ]);
    });

    it('keeps its history through a save', () => {
      const message = said('こんばんわ');
      message.edit('こんばんは', '', 2000);

      expect(reload(message).versions.map((version) => version.text)).toEqual(['こんばんわ', 'こんばんは']);
    });

    it('writes nothing when the words and their staging are as they were', () => {
      const message = said('こんばんは');

      message.edit('こんばんは', '', 2000);

      expect(message.fixd).toBe(false);
      expect(message.versions).toEqual([]);
    });

    it('keeps no earlier wording when only the staging moved beside the words', () => {
      const message = said('こんばんは');

      message.edit('こんばんは', '{"pose":"smile"}', 2000);

      expect(message.fixd).toBe(true);
      expect(message.versions).toEqual([]);
    });

    it('has no history to show for a line edited before it was kept', () => {
      const message = said('こんばんは');
      message.fixd = true;

      expect(message.versions).toEqual([]);
    });

    it('does not take the wording of a line edited before histories were kept for what it first said', () => {
      const message = said('二度目の文面');
      message.fixd = true;

      message.edit('三度目の文面', '', 3000);

      expect(message.versions).toEqual([
        { text: '二度目の文面', since: null, edit: null },
        { text: '三度目の文面', since: 3000, edit: null },
      ]);
    });

    it('takes the staging away when it is given none, keeping the words', () => {
      const message = said('こんばんは');
      message.vnEmote = 'shape:shout';

      message.edit('こんばんは', '', 2000);

      expect(message.vnEmote).toBe('');
      expect(message.text).toBe('こんばんは');
      expect(message.versions).toEqual([]);
    });
  });
});
