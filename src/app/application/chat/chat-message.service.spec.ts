import { inject, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { MyDiceService } from '@axe/application/dice/my-dice.service';
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

  describe('showing a kept-back roll', () => {
    const secretFrom = (mine: boolean) =>
      ({ isSecret: true, isSendFromSelf: mine, tags: ['secret'], tag: 'secret' }) as unknown as ChatMessage;

    const beSeat = (role: PeerRole) => {
      PeerCursor.myCursor = { role, isGameMaster: role === PeerRole.GameMaster } as PeerCursor;
    };

    it('is for whoever rolled it, and for the master', inject([ChatMessageService], (service: ChatMessageService) => {
      beSeat(PeerRole.Player);
      expect(service.canDiscloseMessage(secretFrom(true))).toBe(true);
      expect(service.canDiscloseMessage(secretFrom(false))).toBe(false);

      beSeat(PeerRole.GameMaster);
      expect(service.canDiscloseMessage(secretFrom(false))).toBe(true);

      beSeat(PeerRole.Guest);
      expect(service.canDiscloseMessage(secretFrom(false))).toBe(false);
    }));

    it('stays kept back when anybody else asks for it', inject([ChatMessageService], (service: ChatMessageService) => {
      beSeat(PeerRole.Player);
      const theirs = secretFrom(false);

      service.discloseMessage(theirs);

      expect(theirs.tag).toBe('secret');
    }));
  });

  it('sendSystemMessageToMainTab routes to the first chat tab', inject(
    [ChatMessageService],
    (service: ChatMessageService) => {
      const mainTab = {} as ChatTab;
      const chatTabList = { chatTabs: [mainTab, {} as ChatTab] } as unknown as ChatTabList;
      vi.spyOn(TestBed.inject(ObjectStore), 'get').mockReturnValue(chatTabList as never);
      const toTabSpy = vi.spyOn(service, 'sendSystemMessageToTab').mockReturnValue(undefined as never);

      service.sendSystemMessageToMainTab('hello');

      expect(toTabSpy).toHaveBeenCalledWith(mainTab, 'hello', undefined);
    }
  ));

  describe('an after-the-fact whisper', () => {
    let service: ChatMessageService;
    let tab: ChatTab;
    let other: PeerCursor;

    beforeEach(() => {
      beMyself('me');
      PeerCursor.createMyCursor();
      other = new PeerCursor();
      other.initialize();
      other.userId = 'someone';
      other.name = 'ノア';
      service = TestBed.inject(ChatMessageService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
    });

    afterEach(() => {
      tab.destroy();
      other.destroy();
    });

    const lineFrom = (from: string, text = '本当はノアにだけ'): ChatMessage =>
      tab.addMessage({ from, name: 'アリア', text, timestamp: 1000 });

    it('offers everyone in the room but the reader', () => {
      expect(service.afterWhisperCandidates(lineFrom('me'))).toEqual([other]);
    });

    it('offers nobody whose role may not read the tab the line is in', () => {
      tab.plCanView = false;
      other.role = PeerRole.Player;
      const mine = lineFrom('me');

      expect(service.afterWhisperCandidates(mine)).toEqual([]);
      service.makeAfterWhisper(mine, other);
      expect(mine.isAfterWhisper).toBe(false);

      other.role = PeerRole.GameMaster;
      expect(service.afterWhisperCandidates(mine)).toEqual([other]);
    });

    it('whispers the reader’s own line to the one chosen, and puts it back', () => {
      const mine = lineFrom('me');

      service.makeAfterWhisper(mine, other);
      expect(mine.isAfterWhisper).toBe(true);
      expect(mine.name).toBe('アリア > ノア');
      expect(mine.isDisplayableTo('someone')).toBe(true);
      expect(mine.isDisplayableTo('third')).toBe(false);

      service.undoAfterWhisper(mine);
      expect(mine.isAfterWhisper).toBe(false);
      expect(mine.isDisplayableTo('third')).toBe(true);
    });

    it('is not offered on somebody else’s line', () => {
      const theirs = lineFrom('someone');

      expect(service.canMakeAfterWhisper(theirs)).toBe(false);
      service.makeAfterWhisper(theirs, other);

      expect(theirs.isAfterWhisper).toBe(false);
    });

    it('is not offered on a line whispered from the start', () => {
      const whisper = tab.addMessage({
        from: 'me',
        to: 'someone',
        name: 'アリア > ノア',
        text: '内緒',
        timestamp: 1000,
      });

      expect(service.canMakeAfterWhisper(whisper)).toBe(false);
    });

    it('whispers to nobody who is not in the room', () => {
      const mine = lineFrom('me');
      const gone = new PeerCursor();
      gone.userId = 'gone';

      service.makeAfterWhisper(mine, gone);

      expect(mine.isAfterWhisper).toBe(false);
    });

    it('leaves a dice result where the table saw it', () => {
      const result = tab.addMessage({
        from: 'System-BCDice',
        originFrom: 'me',
        name: 'DiceBot',
        tag: 'system',
        text: '2D6 → 7',
        timestamp: 1001,
      });

      expect(service.canMakeAfterWhisper(result)).toBe(false);
    });

    it('offers putting back only on an after-the-fact whisper', () => {
      const mine = lineFrom('me');

      expect(service.canUndoAfterWhisper(mine)).toBe(false);
      service.makeAfterWhisper(mine, other);
      expect(service.canUndoAfterWhisper(mine)).toBe(true);
    });
  });

  describe('deleting a line', () => {
    let service: ChatMessageService;
    let tab: ChatTab;

    beforeEach(() => {
      beMyself('me');
      service = TestBed.inject(ChatMessageService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
    });

    afterEach(() => {
      tab.destroy();
    });

    const lineFrom = (from: string): ChatMessage =>
      tab.addMessage({ from, name: 'アリア', text: '言い間違い', timestamp: 1000 });

    it('takes the reader’s own line out of the chat, leaving it in the room', () => {
      const mine = lineFrom('me');

      service.pseudoDelete(mine);

      expect(mine.isPseudoDeleted).toBe(true);
      expect(mine.isShownInChat).toBe(false);
      expect(tab.chatMessages).toContain(mine);
      expect(service.canPseudoDelete(mine)).toBe(false);
    });

    it('is not offered on somebody else’s line, or on a dice result', () => {
      const theirs = lineFrom('someone');
      const result = tab.addMessage({
        from: 'System-BCDice',
        originFrom: 'me',
        name: 'DiceBot',
        tag: 'system',
        text: '2D6 → 7',
        timestamp: 1001,
      });

      service.pseudoDelete(theirs);

      expect(theirs.isPseudoDeleted).toBe(false);
      expect(service.canPseudoDelete(result)).toBe(false);
    });
  });

  describe('opening what a die was thrown on', () => {
    let service: ChatMessageService;
    let tab: ChatTab;

    beforeEach(() => {
      beMyself('me');
      service = TestBed.inject(ChatMessageService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
    });

    afterEach(() => {
      tab.destroy();
    });

    it('opens the line that die was thrown on', () => {
      const secret = service.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);

      service.discloseDieRolls('die-a');

      expect(secret.isSecret).toBe(false);
    });

    it('leaves the throw of another die where it was', () => {
      service.sendSecretSystemMessageToTab(tab, '隠しダイスA → 6', 'me', undefined, ['die-a']);
      const other = service.sendSecretSystemMessageToTab(tab, '隠しダイスB → 1', 'me', undefined, ['die-b']);

      service.discloseDieRolls('die-a');

      expect(other.isSecret).toBe(true);
    });

    it('brings the opened line to the end of the tab', () => {
      const secret = service.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      service.sendSystemMessageToTab(tab, 'そのあとの発言');

      service.discloseDieRolls('die-a');

      expect(tab.chatMessages[tab.chatMessages.length - 1]).toBe(secret);
    });

    it('opens the last throw of that die alone, leaving the earlier ones kept back', () => {
      const older = service.sendSecretSystemMessageToTab(tab, '隠しダイス → 1', 'me', undefined, ['die-a']);
      const newer = service.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      const another = service.sendSecretSystemMessageToTab(tab, '隠しダイスB → 3', 'me', undefined, ['die-b']);

      expect(service.discloseDieRolls('die-a')).toBe(1);

      expect(newer.isSecret).toBe(false);
      expect(older.isSecret).toBe(true);
      expect(another.isSecret).toBe(true);
    });

    it('weighs the throws against each other across the tabs', () => {
      const other = ChatTabList.instance.addChatTab('べつのタブ');
      try {
        vi.spyOn(service, 'getTime').mockReturnValueOnce(2000).mockReturnValueOnce(1000);
        const newer = service.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
        const older = service.sendSecretSystemMessageToTab(other, '隠しダイス → 1', 'me', undefined, ['die-a']);

        expect(service.discloseDieRolls('die-a')).toBe(1);

        expect(newer.isSecret).toBe(false);
        expect(older.isSecret).toBe(true);
      } finally {
        other.destroy();
      }
    });

    it('says how many lines it opened', () => {
      service.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);

      expect(service.discloseDieRolls('die-a')).toBe(1);
    });

    it('says none for a die with no throw of it left kept back', () => {
      expect(service.discloseDieRolls('die-a')).toBe(0);
    });

    it('says none, and opens none, for a throw that is somebody else to open', () => {
      const secret = service.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      beMyself('another-player');

      expect(service.discloseDieRolls('die-a')).toBe(0);
      expect(secret.isSecret).toBe(true);
    });

    it('opens the throw of a die that is somebody else for the master', () => {
      const secret = service.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      beMyself('the-master');
      PeerCursor.myCursor = { role: PeerRole.GameMaster } as PeerCursor;

      expect(service.discloseDieRolls('die-a')).toBe(1);
      expect(secret.isSecret).toBe(false);
    });

    it('finds the throw in whichever tab it was said in', () => {
      const another = ChatTabList.instance.addChatTab('べつのタブ');
      try {
        const secret = service.sendSecretSystemMessageToTab(another, '隠しダイス → 6', 'me', undefined, ['die-a']);

        service.discloseDieRolls('die-a');

        expect(secret.isSecret).toBe(false);
      } finally {
        another.destroy();
      }
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
  });
});
