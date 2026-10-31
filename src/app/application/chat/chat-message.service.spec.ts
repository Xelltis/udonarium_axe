import { inject, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { MyDiceService } from '@axe/application/dice/my-dice.service';
import { resourceEditMessage$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { setPortraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { OPEN_STAMP_RULES, withStampsAllowed, withStampUseOn } from '@axe/domain/chat/stamp-rules';
import { DEFAULT_SYSTEM_NOTICES, NOTICE_OFF, withNoticeRoute } from '@axe/domain/chat/system-notices';
import { DataElement } from '@axe/domain/data/data-element';
import { decodeDiceLook, PLAIN_DICE_LOOK } from '@axe/domain/dice/dice-3d/dice-look';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatMessageService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, ChatMessageService],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should ...', inject([ChatMessageService], (service: ChatMessageService) => {
    expect(service).toBeTruthy();
  }));

  describe('a guest on a room server speaking as whoever they last spoke as', () => {
    let service: ChatMessageService;
    let tab: ChatTab;
    const original = PeerCursor.myCursor;

    beforeEach(() => {
      beMyself('me');
      service = TestBed.inject(ChatMessageService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
    });

    afterEach(() => {
      tab.destroy();
      PeerCursor.myCursor = original;
    });

    it('says no notice in a tab guests may not speak in, which the server would take back, but does where they may', () => {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
      PeerCursor.myCursor = { role: PeerRole.Guest, isGameMaster: false, identifier: 'me-cursor' } as PeerCursor;
      const lines = () => tab.chatMessages.length;
      tab.guestCanSpeak = false;
      service.sendSystemMessageAsLastSpeaker('点呼：1/3', tab.identifier);
      expect(lines()).toBe(0);

      tab.guestCanSpeak = true;
      service.sendSystemMessageAsLastSpeaker('点呼：2/3', tab.identifier);
      expect(lines()).toBe(1);
    });
  });

  describe('a notice of a kind the room may send somewhere of its choosing', () => {
    let service: ChatMessageService;
    let first: ChatTab;
    let battle: ChatTab;

    const route = (kind: 'round' | 'card', to: string) => {
      Config.instance.systemNotices = withNoticeRoute(Config.instance.systemNotices, kind, to);
    };

    beforeEach(() => {
      service = TestBed.inject(ChatMessageService);
      first = ChatTabList.instance.addChatTab('メイン');
      battle = ChatTabList.instance.addChatTab('戦闘');
    });

    afterEach(() => {
      Config.instance.systemNotices = DEFAULT_SYSTEM_NOTICES;
      battle.destroy();
      first.destroy();
    });

    it('goes where its kind always went while the room chose nothing: the leftmost tab, or the system one', () => {
      const list = ChatTabList.instance;
      const index = list.systemMessageTabIndex;
      list.systemMessageTabIndex = list.chatTabs.indexOf(battle);
      try {
        const leftmost = list.chatTabs[0];
        expect(leftmost).not.toBe(battle);

        const round = service.sendSystemNotice('round', 'ラウンド1開始です。');
        const card = service.sendSystemNotice('card', '配りました。');

        expect(leftmost.chatMessages).toContain(round);
        expect(list.systemMessageTab).toBe(battle);
        expect(battle.chatMessages).toContain(card);
      } finally {
        list.systemMessageTabIndex = index;
      }
    });

    it('goes to the tab the room chose for its kind, and leaves the other kinds where they went', () => {
      route('round', battle.identifier);

      const round = service.sendSystemNotice('round', 'ラウンド1開始です。');

      expect(battle.chatMessages).toContain(round);
      expect(round?.tags).toContain('system-message');
      expect(service.noticeTabOf('card')).toBe(ChatTabList.instance.systemMessageTab);
    });

    it('is written nowhere for a kind the room sends nowhere', () => {
      route('round', NOTICE_OFF);
      const before = ChatTabList.instance.chatTabs.map((tab) => tab.chatMessages.length);

      expect(service.sendSystemNotice('round', 'ラウンド1開始です。')).toBeNull();

      expect(ChatTabList.instance.chatTabs.map((tab) => tab.chatMessages.length)).toEqual(before);
    });

    it('goes where its kind always went once the tab chosen for it is gone', () => {
      route('round', 'a-tab-since-deleted');

      expect(service.noticeTabOf('round')).toBe(ChatTabList.instance.chatTabs[0]);
    });

    it('is kept back as a secret where it is asked to be', () => {
      route('round', battle.identifier);

      const kept = service.sendSystemNotice('round', '罠が作動した', { secret: true, from: 'me' });

      expect(kept?.isSecret).toBe(true);
      expect(battle.chatMessages).toContain(kept);
    });
  });

  describe('a notice meant for one person', () => {
    it('is marked as housekeeping when it is asked to be', () => {
      const service = TestBed.inject(ChatMessageService);
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      try {
        const message = service.sendSystemMessageOnePlayer(tab, 'お知らせ', 'nobody', undefined, true);

        expect(message.isOutOfStory).toBe(true);
      } finally {
        tab.destroy();
      }
    });

    it('belongs to the story when it is not', () => {
      const service = TestBed.inject(ChatMessageService);
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      try {
        const message = service.sendSystemMessageOnePlayer(tab, 'お知らせ', 'nobody');

        expect(message.isOutOfStory).toBe(false);
      } finally {
        tab.destroy();
      }
    });
  });

  describe('sending a stamp', () => {
    function sent(stampId: string, sendTo?: string): { message: ChatMessage | null; tab: ChatTab } {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      const tab = new ChatTab();
      tab.initialize();
      ObjectStore.instance.add(tab);
      const message = service.sendStamp(tab, stampId, '［ゾワッ］', PeerCursor.myCursor.identifier, sendTo);
      return { message, tab };
    }

    it('sends it as a line of its own, with its words standing in for it and nothing read out of them', () => {
      const dice = vi.spyOn(TestBed.inject(ObjectStore), 'get');
      const { message, tab } = sent('sfx:creepy');

      expect(message!.stamp).toBe('sfx:creepy');
      expect(message!.sentStamp).toBe('sfx:creepy');
      expect(message!.text).toBe('［ゾワッ］');
      expect(message!.tag ?? '').toBe('');
      expect(message!.attachmentImageIdentifiers).toBe('');
      expect(tab.chatMessages).toEqual([message]);
      expect(dice).not.toHaveBeenCalledWith('DiceBot');
    });

    it('carries a picture from the room with it, for whatever cannot draw the stamp', () => {
      const { message } = sent('image:stamp-picture');

      expect(message!.attachmentImageIdentifierList).toEqual(['stamp-picture']);
    });

    it('sends nothing into a tab the reader\u2019s role may not speak in', () => {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Guest;
      const tab = new ChatTab();
      tab.initialize();
      tab.guestCanSpeak = false;
      ObjectStore.instance.add(tab);
      try {
        expect(service.sendStamp(tab, 'seal:ok', '［了解］', PeerCursor.myCursor.identifier)).toBeNull();
        expect(tab.chatMessages).toEqual([]);
      } finally {
        PeerCursor.myCursor.role = PeerRole.Player;
      }
    });

    it('sends a stamp with nothing said as a line of its own, and leaves one with words to the caller', () => {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      const tab = new ChatTab();
      tab.initialize();
      ObjectStore.instance.add(tab);
      const outgoing = {
        text: '',
        gameSystem: null,
        sendFrom: PeerCursor.myCursor.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#000000',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
        stamp: { id: 'seal:ok', words: '［了解］' },
      };

      expect(service.sendLoneStamp(tab, { ...outgoing, text: 'いくぞ！' })).toBe(false);
      expect(tab.chatMessages).toEqual([]);
      expect(service.sendLoneStamp(tab, { ...outgoing, stamp: undefined })).toBe(false);

      expect(service.sendLoneStamp(tab, outgoing)).toBe(true);
      expect(tab.chatMessages.map((message) => [message.sentStamp, message.text])).toEqual([['seal:ok', '［了解］']]);
    });

    it('sends nothing for a stamp the room does not let be sent, or where stamps are not sent at all', () => {
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['sfx:creepy'], false);
      try {
        expect(sent('sfx:creepy').message).toBeNull();

        Config.instance.stampRules = withStampUseOn(OPEN_STAMP_RULES, 'line', false);
        expect(sent('seal:ok').message).toBeNull();
      } finally {
        Config.instance.stampRules = OPEN_STAMP_RULES;
      }
    });

    it('sends nothing for a stamp this version does not know', () => {
      const { message, tab } = sent('sfx:from-a-newer-version');

      expect(message).toBeNull();
      expect(tab.chatMessages).toEqual([]);
    });
  });

  describe('sending a stamp with words', () => {
    function said(text: string, stampId: string, words: string): ChatMessage {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      const tab = new ChatTab();
      tab.initialize();
      ObjectStore.instance.add(tab);
      const stamp = { id: stampId, words };
      const none = undefined;
      return service.sendMessage(
        tab,
        text,
        null,
        PeerCursor.myCursor.identifier,
        none,
        none,
        none,
        none,
        none,
        none,
        none,
        none,
        none,
        stamp
      );
    }

    it('puts the stamp under the words, with the words standing in for it on a last line', () => {
      const message = said('いくぞ！', 'roll:critical', '［クリティカル!］');

      expect(message.sentStamp).toBe('roll:critical');
      expect(message.text).toBe('いくぞ！\n［クリティカル!］');
      expect(message.saidWithStamp).toBe('いくぞ！');
    });

    it('carries a picture from the room among what the words attach', () => {
      expect(said('これ', 'image:stamp-picture', '［ナイス］').attachmentImageIdentifierList).toEqual([
        'stamp-picture',
      ]);
    });

    it('sends the words alone under a stamp the room does not let be sent', () => {
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['roll:critical'], false);
      try {
        const message = said('いくぞ！', 'roll:critical', '［クリティカル!］');

        expect(message.text).toBe('いくぞ！');
        expect(message.sentStamp).toBeNull();
      } finally {
        Config.instance.stampRules = OPEN_STAMP_RULES;
      }
    });

    it('sends the words alone under a stamp this version does not know', () => {
      const message = said('いくぞ！', 'sfx:from-a-newer-version', '［新しいスタンプ］');

      expect(message.text).toBe('いくぞ！');
      expect(message.sentStamp).toBeNull();
    });
  });

  describe('sending stamps put inside a line', () => {
    function said(text: string): ChatMessage {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      const tab = new ChatTab();
      tab.initialize();
      ObjectStore.instance.add(tab);
      return service.sendMessage(tab, text, null, PeerCursor.myCursor.identifier);
    }

    it('sends them as they were written, a picture from the room going among the attachments once', () => {
      const message = said('了解［了解:seal:ok］［絵:image:stamp-picture］［絵:image:stamp-picture］');

      expect(message.text).toBe('了解［了解:seal:ok］［絵:image:stamp-picture］［絵:image:stamp-picture］');
      expect(message.attachmentImageIdentifierList).toEqual(['stamp-picture']);
    });

    it('writes as its name a stamp the room does not let be sent, or one this version does not know', () => {
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['seal:ok'], false);
      try {
        const message = said('［了解:seal:ok］と［新顔:sfx:fromthefuture］と［ドッ:sfx:boom］');

        expect(message.text).toBe('［了解］ と ［新顔］ と［ドッ:sfx:boom］');
      } finally {
        Config.instance.stampRules = OPEN_STAMP_RULES;
      }
    });

    it('keeps the name a stamp the room does not let be sent is written as apart from the words round it', () => {
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['seal:ok'], false);
      try {
        expect(said('2d6［了解:seal:ok］').text).toBe('2d6 ［了解］');
        expect(said('a ［了解:seal:ok］ b').text).toBe('a ［了解］ b');
      } finally {
        Config.instance.stampRules = OPEN_STAMP_RULES;
      }
    });

    it('keeps the name a stamp the room does not let be sent is written as from being read as a tag', () => {
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['image:a', 'image:b'], false);
      try {
        const message = said('［赤:image:a］ 文 ［/:image:b］');

        expect(message.text).toBe('\\［赤］ 文 \\［/］');
      } finally {
        Config.instance.stampRules = OPEN_STAMP_RULES;
      }
    });

    describe('in a line rewritten after it was said', () => {
      it('writes a stamp the room does not let be sent as its name, as a line said anew', () => {
        const message = said('まずは');
        Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['sfx:boom'], false);
        try {
          TestBed.inject(ChatMessageService).editMessage(message, 'まずは［ドッ:sfx:boom］', '', 2000);

          expect(message.text).toBe('まずは ［ドッ］');
        } finally {
          Config.instance.stampRules = OPEN_STAMP_RULES;
        }
      });

      it('carries the pictures of the stamps it now holds, and lets go those it holds no more', () => {
        const service = TestBed.inject(ChatMessageService);
        const message = said('これ［絵:image:stamp-picture］');
        message.attachmentImageIdentifiers = JSON.stringify(['stamp-picture', 'attached-by-hand']);

        service.editMessage(message, 'これ［別:image:other-picture］', '', 2000);

        expect(message.attachmentImageIdentifierList).toEqual(['attached-by-hand', 'other-picture']);
        service.editMessage(message, 'これ', '', 3000);
        expect(message.attachmentImageIdentifierList).toEqual(['attached-by-hand']);
      });

      it('keeps the picture of the stamp under the line, used inside it too, when it is taken out of the line', () => {
        const service = TestBed.inject(ChatMessageService);
        const message = said('これ［絵:image:stamp-picture］');
        message.stamp = 'image:stamp-picture';

        service.editMessage(message, 'これ', '', 2000);

        expect(message.attachmentImageIdentifierList).toEqual(['stamp-picture']);
      });

      it('rewrites what was said with a stamp under the line, keeping the words standing in for the stamp', () => {
        const message = said('hello');
        message.text = 'hello\n［了解］';
        message.stamp = 'seal:ok';

        TestBed.inject(ChatMessageService).editMessage(message, 'hello world', '', 2000);

        expect(message.text).toBe('hello world\n［了解］');
        expect(message.saidWithStamp).toBe('hello world');
      });

      it('lets go the picture of a stamp the room has stopped since, which goes out as its name', () => {
        const service = TestBed.inject(ChatMessageService);
        const message = said('これ［絵:image:stamp-picture］');
        Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['image:stamp-picture'], false);
        try {
          service.editMessage(message, 'これだ［絵:image:stamp-picture］', '', 2000);

          expect(message.text).toBe('これだ ［絵］');
          expect(message.attachmentImageIdentifierList).toEqual([]);
        } finally {
          Config.instance.stampRules = OPEN_STAMP_RULES;
        }
      });
    });
  });

  describe('what a line records about who spoke it', () => {
    it('writes down the role the speaker was wearing at the time', () => {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      const chatTab = new ChatTab();
      chatTab.initialize();
      ObjectStore.instance.add(chatTab);

      const message = service.sendMessage(chatTab, 'では、判定を', null, PeerCursor.myCursor.identifier);

      expect(message.senderRole).toBe(PeerRole.GameMaster);
    });

    it('keeps a whisper to someone not here at the moment addressed to them, not to everybody', () => {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      const chatTab = new ChatTab();
      chatTab.initialize();
      ObjectStore.instance.add(chatTab);

      const message = service.sendMessage(chatTab, 'ないしょ', null, PeerCursor.myCursor.identifier, 'cursor-away');

      expect(message.to).toBe('cursor-away');
    });

    it('sends a whisper to a cursor that went to the user it stood for, named as the cursor they came back on', () => {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      const chatTab = new ChatTab();
      chatTab.initialize();
      ObjectStore.instance.add(chatTab);
      const before = new PeerCursor('bob-before');
      before.initialize();
      before.userId = 'user-bob';
      ObjectStore.instance.remove(before);

      const away = service.sendMessage(chatTab, 'ないしょ', null, PeerCursor.myCursor.identifier, 'bob-before');
      const after = new PeerCursor('bob-after');
      after.initialize();
      after.userId = 'user-bob';
      after.name = 'ボブ';
      const back = service.sendMessage(chatTab, 'ないしょ', null, PeerCursor.myCursor.identifier, 'bob-before');

      expect([away.to, back.to]).toEqual(['user-bob', 'user-bob']);
      expect(back.name.endsWith(' > ボブ')).toBe(true);
      ObjectStore.instance.remove(after);
    });
  });

  describe('how the speaker’s dice look', () => {
    function said(role?: PeerRole): ChatMessage {
      const service = TestBed.inject(ChatMessageService);
      PeerCursor.createMyCursor();
      if (role) PeerCursor.myCursor.role = role;
      const chatTab = new ChatTab();
      chatTab.initialize();
      ObjectStore.instance.add(chatTab);
      return service.sendMessage(chatTab, '2d6', null, PeerCursor.myCursor.identifier);
    }

    afterEach(() => localStorage.removeItem('my-dice'));

    it('carries the look this seat chose, for the dice bot’s answer to throw the dice in', () => {
      TestBed.inject(MyDiceService).set({ ...PLAIN_DICE_LOOK, material: 'marble', body: '#1e6b52', ink: '' });

      expect(decodeDiceLook(said().diceLook)).toEqual({
        ...PLAIN_DICE_LOOK,
        material: 'marble',
        body: '#1e6b52',
        ink: '',
      });
    });

    it('carries nothing for the plain look', () => {
      expect(said().diceLook ?? '').toBe('');
      expect(said().diceImageIdentifier ?? '').toBe('');
    });

    it('carries the picture on the dice apart from the look, and sees that the room has it', () => {
      const dice = TestBed.inject(MyDiceService);
      const shared = vi.spyOn(dice, 'ensureShared').mockResolvedValue();
      dice.set({ ...PLAIN_DICE_LOOK, picture: 'ab'.repeat(32), pictureFit: 'faces' });

      const line = said();

      expect(line.diceImageIdentifier).toBe('ab'.repeat(32));
      expect(decodeDiceLook(line.diceLook, line.diceImageIdentifier).pictureFit).toBe('faces');
      expect(shared).toHaveBeenCalled();
    });

    it('carries no picture from a guest, who may not add to the room’s images', () => {
      const dice = TestBed.inject(MyDiceService);
      const shared = vi.spyOn(dice, 'ensureShared').mockResolvedValue();
      dice.set({ ...PLAIN_DICE_LOOK, material: 'metal', picture: 'ab'.repeat(32), body: '#1e6b52' });

      const line = said(PeerRole.Guest);

      expect(line.diceImageIdentifier ?? '').toBe('');
      expect(decodeDiceLook(line.diceLook)).toMatchObject({ material: 'metal', body: '#1e6b52' });
      expect(shared).not.toHaveBeenCalled();
    });
  });

  describe('a line spoken under a name of its own', () => {
    afterEach(() => {
      PeerCursor.myCursor = null!;
    });

    it('carries that name and no speaker, and leaves who the reader last spoke as alone', () => {
      const service = TestBed.inject(ChatMessageService);
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId: 'door-opener' } as IPeerContext);
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.lastControlCharacterName = '勇者';
      const chatTab = new ChatTab();
      chatTab.initialize();
      ObjectStore.instance.add(chatTab);

      const message = service.sendAsNamed(chatTab, '古い扉がきしむ', null, '古い扉');

      expect(message.name).toBe('古い扉');
      expect(message.sendFrom).toBe('');
      expect(message.text).toBe('古い扉がきしむ');
      expect(message.from).toBe('door-opener');
      expect(message.isSystem).toBe(false);
      expect(PeerCursor.myCursor.lastControlCharacterName).toBe('勇者');
    });

    it('sends the stamps of a line under a name of its own as a line said anew goes out', () => {
      const service = TestBed.inject(ChatMessageService);
      const chatTab = new ChatTab();
      chatTab.initialize();
      ObjectStore.instance.add(chatTab);
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['seal:ok'], false);
      try {
        const message = service.sendAsNamed(chatTab, '開いた［了解:seal:ok］［絵:image:door-picture］', null, '扉');

        expect(message.text).toBe('開いた ［了解］ ［絵:image:door-picture］');
        expect(message.attachmentImageIdentifierList).toEqual(['door-picture']);
      } finally {
        Config.instance.stampRules = OPEN_STAMP_RULES;
      }
    });
  });

  describe('the portrait command at the end of a line', () => {
    let service: ChatMessageService;
    let character: GameCharacter;
    let chatTab: ChatTab;

    beforeEach(() => {
      service = TestBed.inject(ChatMessageService);
      const imageStorage = TestBed.inject(ImageStorage);
      for (const identifier of ['img-0', 'img-1', 'img-2']) imageStorage.add(identifier);

      character = GameCharacter.create('ヒロ', 1, '');
      const image = character.imageDataElement!;
      image.children[0].value = 'img-0';
      image.appendChild(DataElement.create('imageIdentifier', 'img-1', { type: 'image' }, ''));
      image.appendChild(DataElement.create('imageIdentifier', 'img-2', { type: 'image' }, ''));
      setPortraitNameOf(image.children[0], '通常');
      setPortraitNameOf(image.children[1], '笑顔');
      setPortraitNameOf(image.children[2], '怒り2');

      PeerCursor.createMyCursor();
      chatTab = new ChatTab();
      chatTab.initialize();
      ObjectStore.instance.add(chatTab);
    });

    function speak(text: string) {
      return service.sendMessage(chatTab, text, null, character.identifier);
    }

    it('takes the command off a line sent with a stamp before the stamp\u2019s words go under it', () => {
      const none = undefined;
      const stamp = { id: 'feel:smile', words: '［にこにこ］' };
      const message = service.sendMessage(
        chatTab,
        'やった @笑顔',
        null,
        character.identifier,
        none,
        none,
        none,
        none,
        none,
        none,
        none,
        none,
        none,
        stamp
      );

      expect(message.text).toBe('やった \n［にこにこ］');
      expect(message.imageIdentifier).toBe('img-1');
    });

    it('switches to the portrait the name picks out and takes the command off the line', () => {
      const message = speak('こんにちは @笑顔');

      expect(message.imageIdentifier).toBe('img-1');
      expect(message.text).toBe('こんにちは ');
      expect(character.selectedPortraitIndex).toBe(1);
    });

    it('settles for the first name that starts the same way', () => {
      expect(speak('こんにちは @怒').imageIdentifier).toBe('img-2');
    });

    it('reads a name that ends in digits as a name, not a number', () => {
      expect(speak('こんにちは @怒り2').imageIdentifier).toBe('img-2');
      expect(character.selectedPortraitIndex).toBe(2);
    });

    it('remembers the portrait a number chose', () => {
      speak('こんにちは @2');

      expect(character.selectedPortraitIndex).toBe(1);
    });

    it('minds neither case nor width', () => {
      expect(speak('こんにちは ＠笑顔').imageIdentifier).toBe('img-1');
      expect(speak('こんにちは ＠２').imageIdentifier).toBe('img-1');
      expect(speak('こんにちは ＠ＨＩＤＥ').imageIdentifier).toBe('');
    });

    it('counts the number from the first portrait, not from zero', () => {
      expect(speak('こんにちは @1').imageIdentifier).toBe('img-0');
      expect(speak('こんにちは @3').imageIdentifier).toBe('img-2');
    });

    it('leaves a number no portrait sits at in the line it was typed on', () => {
      expect(speak('こんにちは @0').text).toBe('こんにちは @0');
      expect(speak('こんにちは @4').text).toBe('こんにちは @4');
    });

    it('hides on command', () => {
      expect(speak('こんにちは @hide').imageIdentifier).toBe('');
    });

    it('leaves a name nobody answers to in the line it was typed on', () => {
      const message = speak('こんにちは @存在しない');

      expect(message.text).toBe('こんにちは @存在しない');
      expect(character.selectedPortraitIndex).toBe(0);
    });

    it('remembers the portrait the command chose, not the one it started from', () => {
      speak('こんにちは @笑顔');

      expect(PeerCursor.myCursor.lastControlImageIdentifier).toBe('img-1');
      expect(PeerCursor.myCursor.lastControlImageIndex).toBe(1);
    });
    describe('spoken by a guest on a room server, which writes no piece', () => {
      let resourceEdits: string[];
      let stopListening: () => void;

      beforeEach(() => {
        PeerCursor.myCursor.role = PeerRole.Guest;
        vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
        resourceEdits = [];
        stopListening = resourceEditMessage$.subscribe((event) => resourceEdits.push(event.messageIdentifier));
      });

      afterEach(() => stopListening());

      it('shows the portrait on the line but leaves the piece showing its own', () => {
        const message = speak('こんにちは @笑顔');

        expect(message.imageIdentifier).toBe('img-1');
        expect(character.selectedPortraitIndex).toBe(0);
      });

      it('stands the portrait in none of the tab’s slots, which the server would put back', () => {
        vi.spyOn(service as unknown as { findImagePos(id: string): number }, 'findImagePos').mockReturnValue(1);
        const slots = [...chatTab.imageIdentifier];

        speak('こんにちは @笑顔');

        expect(chatTab.imageIdentifier).toEqual(slots);
      });

      it('stands no portrait in the tab’s slots for a stamp either', () => {
        vi.spyOn(service as unknown as { findImagePos(id: string): number }, 'findImagePos').mockReturnValue(1);
        chatTab.guestCanSpeak = true;
        const slots = [...chatTab.imageIdentifier];

        service.sendStamp(chatTab, 'seal:ok', '［了解］', character.identifier);

        expect(chatTab.imageIdentifier).toEqual(slots);
      });

      it('stands no portrait in a tab’s slots for a line copied there either', () => {
        const other = new ChatTab();
        other.initialize();
        ObjectStore.instance.add(other);
        const said = chatTab.addMessage({
          from: 'me',
          name: 'ヒロ',
          text: 'こんにちは',
          timestamp: 1000,
          imageIdentifier: 'img-1',
          imagePos: 1,
        });
        const slots = [...other.imageIdentifier];

        service.copyMessageToTab(said, other);

        expect(other.imageIdentifier).toEqual(slots);
        other.destroy();
      });

      it('reads no resource edit out of the line, but does among peers', () => {
        speak(':HP-3');
        expect(resourceEdits).toEqual([]);

        vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
        const message = speak(':HP-3 @笑顔');
        expect(resourceEdits).toEqual([message.identifier]);
        expect(character.selectedPortraitIndex).toBe(1);
      });
    });
  });
});
