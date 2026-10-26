import { inject, TestBed } from '@angular/core/testing';
import { ChatClockService } from '@axe/application/chat/chat-clock.service';
import { ChatLineEditService } from '@axe/application/chat/chat-line-edit.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { Network } from '@axe/core/network/network';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatLineEditService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('showing a kept-back roll', () => {
    const secretFrom = (mine: boolean) =>
      ({ isSecret: true, isSendFromSelf: mine, tags: ['secret'], tag: 'secret' }) as unknown as ChatMessage;

    const beSeat = (role: PeerRole) => {
      PeerCursor.myCursor = { role, isGameMaster: role === PeerRole.GameMaster } as PeerCursor;
    };

    it('is for whoever rolled it, and for the master', inject(
      [ChatLineEditService],
      (lineEdit: ChatLineEditService) => {
        beSeat(PeerRole.Player);
        expect(lineEdit.canDiscloseMessage(secretFrom(true))).toBe(true);
        expect(lineEdit.canDiscloseMessage(secretFrom(false))).toBe(false);

        beSeat(PeerRole.GameMaster);
        expect(lineEdit.canDiscloseMessage(secretFrom(false))).toBe(true);

        beSeat(PeerRole.Guest);
        expect(lineEdit.canDiscloseMessage(secretFrom(false))).toBe(false);
      }
    ));

    it('stays kept back when anybody else asks for it', inject(
      [ChatLineEditService],
      (lineEdit: ChatLineEditService) => {
        beSeat(PeerRole.Player);
        const theirs = secretFrom(false);

        lineEdit.discloseMessage(theirs);

        expect(theirs.tag).toBe('secret');
      }
    ));
  });

  describe('an after-the-fact whisper', () => {
    let lineEdit: ChatLineEditService;
    let tab: ChatTab;
    let other: PeerCursor;

    beforeEach(() => {
      beMyself('me');
      PeerCursor.createMyCursor();
      other = new PeerCursor();
      other.initialize();
      other.userId = 'someone';
      other.name = 'ノア';
      lineEdit = TestBed.inject(ChatLineEditService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
    });

    afterEach(() => {
      tab.destroy();
      other.destroy();
    });

    const lineFrom = (from: string, text = '本当はノアにだけ'): ChatMessage =>
      tab.addMessage({ from, name: 'アリア', text, timestamp: 1000 });

    it('offers everyone in the room but the reader', () => {
      expect(lineEdit.afterWhisperCandidates(lineFrom('me'))).toEqual([other]);
    });

    it('offers nobody whose role may not read the tab the line is in', () => {
      tab.plCanView = false;
      other.role = PeerRole.Player;
      const mine = lineFrom('me');

      expect(lineEdit.afterWhisperCandidates(mine)).toEqual([]);
      lineEdit.makeAfterWhisper(mine, other);
      expect(mine.isAfterWhisper).toBe(false);

      other.role = PeerRole.GameMaster;
      expect(lineEdit.afterWhisperCandidates(mine)).toEqual([other]);
    });

    it('offers on a room server no seat not logged in, whose id anybody may take', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      other.role = PeerRole.Guest;
      const mine = lineFrom('me');

      expect(lineEdit.afterWhisperCandidates(mine)).toEqual([]);
      lineEdit.makeAfterWhisper(mine, other);
      expect(mine.isAfterWhisper).toBe(false);

      other.userId = 'acct_someone';
      expect(lineEdit.afterWhisperCandidates(mine)).toEqual([other]);
      vi.restoreAllMocks();
    });

    it('whispers the reader’s own line to the one chosen, and puts it back', () => {
      const mine = lineFrom('me');

      lineEdit.makeAfterWhisper(mine, other);
      expect(mine.isAfterWhisper).toBe(true);
      expect(mine.name).toBe('アリア > ノア');
      expect(mine.isDisplayableTo('someone')).toBe(true);
      expect(mine.isDisplayableTo('third')).toBe(false);

      lineEdit.undoAfterWhisper(mine);
      expect(mine.isAfterWhisper).toBe(false);
      expect(mine.isDisplayableTo('third')).toBe(true);
    });

    it('is not offered on somebody else’s line', () => {
      const theirs = lineFrom('someone');

      expect(lineEdit.canMakeAfterWhisper(theirs)).toBe(false);
      lineEdit.makeAfterWhisper(theirs, other);

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

      expect(lineEdit.canMakeAfterWhisper(whisper)).toBe(false);
    });

    it('whispers to nobody who is not in the room', () => {
      const mine = lineFrom('me');
      const gone = new PeerCursor();
      gone.userId = 'gone';

      lineEdit.makeAfterWhisper(mine, gone);

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

      expect(lineEdit.canMakeAfterWhisper(result)).toBe(false);
    });

    it('offers putting back only on an after-the-fact whisper', () => {
      const mine = lineFrom('me');

      expect(lineEdit.canUndoAfterWhisper(mine)).toBe(false);
      lineEdit.makeAfterWhisper(mine, other);
      expect(lineEdit.canUndoAfterWhisper(mine)).toBe(true);
    });
  });

  describe('deleting a line', () => {
    let lineEdit: ChatLineEditService;
    let tab: ChatTab;

    beforeEach(() => {
      beMyself('me');
      lineEdit = TestBed.inject(ChatLineEditService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
    });

    afterEach(() => {
      tab.destroy();
    });

    const lineFrom = (from: string): ChatMessage =>
      tab.addMessage({ from, name: 'アリア', text: '言い間違い', timestamp: 1000 });

    it('takes the reader’s own line out of the chat, leaving it in the room', () => {
      const mine = lineFrom('me');

      lineEdit.pseudoDelete(mine);

      expect(mine.isPseudoDeleted).toBe(true);
      expect(mine.isShownInChat).toBe(false);
      expect(tab.chatMessages).toContain(mine);
      expect(lineEdit.canPseudoDelete(mine)).toBe(false);
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

      lineEdit.pseudoDelete(theirs);

      expect(theirs.isPseudoDeleted).toBe(false);
      expect(lineEdit.canPseudoDelete(result)).toBe(false);
    });
  });

  describe('a guest’s own lines on a room server', () => {
    let lineEdit: ChatLineEditService;
    let tab: ChatTab;
    const original = PeerCursor.myCursor;

    beforeEach(() => {
      beMyself('me');
      lineEdit = TestBed.inject(ChatLineEditService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
      PeerCursor.myCursor = { role: PeerRole.Guest, isGameMaster: false } as PeerCursor;
    });

    afterEach(() => {
      tab.destroy();
      PeerCursor.myCursor = original;
    });

    const mineIn = (guestCanSpeak: boolean) => {
      tab.guestCanSpeak = guestCanSpeak;
      return tab.addMessage({ from: 'me', name: 'ゲスト', text: 'こんにちは', tag: 'secret', timestamp: 1000 });
    };
    const offered = (line: ChatMessage) => [
      lineEdit.canEditMessage(line),
      lineEdit.canPseudoDelete(line),
      lineEdit.canMakeAfterWhisper(line),
      lineEdit.canDiscloseMessage(line),
    ];

    it('offers no change to one in a tab guests may not speak in, which the server would put back', () => {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');

      expect(offered(mineIn(false))).toEqual([false, false, false, false]);
    });

    it('offers the changes where guests may speak, and everywhere among peers', () => {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
      expect(offered(mineIn(true))).toEqual([true, true, true, true]);

      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
      expect(offered(mineIn(false))).toEqual([true, true, true, true]);
    });
  });

  describe('opening what a die was thrown on', () => {
    let lineEdit: ChatLineEditService;
    let chat: ChatMessageService;
    let tab: ChatTab;

    beforeEach(() => {
      beMyself('me');
      lineEdit = TestBed.inject(ChatLineEditService);
      chat = TestBed.inject(ChatMessageService);
      tab = ChatTabList.instance.addChatTab('テストタブ');
    });

    afterEach(() => {
      tab.destroy();
    });

    it('opens the line that die was thrown on', () => {
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);

      lineEdit.discloseDieRolls('die-a');

      expect(secret.isSecret).toBe(false);
    });

    it('leaves the throw of another die where it was', () => {
      chat.sendSecretSystemMessageToTab(tab, '隠しダイスA → 6', 'me', undefined, ['die-a']);
      const other = chat.sendSecretSystemMessageToTab(tab, '隠しダイスB → 1', 'me', undefined, ['die-b']);

      lineEdit.discloseDieRolls('die-a');

      expect(other.isSecret).toBe(true);
    });

    it('brings the opened line to the end of the tab', () => {
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      chat.sendSystemMessageToTab(tab, 'そのあとの発言');

      lineEdit.discloseDieRolls('die-a');

      expect(tab.chatMessages[tab.chatMessages.length - 1]).toBe(secret);
    });

    it('opens the last throw of that die alone, leaving the earlier ones kept back', () => {
      const older = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 1', 'me', undefined, ['die-a']);
      const newer = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      const another = chat.sendSecretSystemMessageToTab(tab, '隠しダイスB → 3', 'me', undefined, ['die-b']);

      expect(lineEdit.discloseDieRolls('die-a')).toBe(1);

      expect(newer.isSecret).toBe(false);
      expect(older.isSecret).toBe(true);
      expect(another.isSecret).toBe(true);
    });

    it('weighs the throws against each other across the tabs', () => {
      const other = ChatTabList.instance.addChatTab('べつのタブ');
      try {
        vi.spyOn(TestBed.inject(ChatClockService), 'now').mockReturnValueOnce(2000).mockReturnValueOnce(1000);
        const newer = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
        const older = chat.sendSecretSystemMessageToTab(other, '隠しダイス → 1', 'me', undefined, ['die-a']);

        expect(lineEdit.discloseDieRolls('die-a')).toBe(1);

        expect(newer.isSecret).toBe(false);
        expect(older.isSecret).toBe(true);
      } finally {
        other.destroy();
      }
    });

    it('says how many lines it opened', () => {
      chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);

      expect(lineEdit.discloseDieRolls('die-a')).toBe(1);
    });

    it('says none for a die with no throw of it left kept back', () => {
      expect(lineEdit.discloseDieRolls('die-a')).toBe(0);
    });

    it('says none, and opens none, for a throw that is somebody else to open', () => {
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      beMyself('another-player');

      expect(lineEdit.discloseDieRolls('die-a')).toBe(0);
      expect(secret.isSecret).toBe(true);
    });

    it('opens the throw of a die that is somebody else for the master', () => {
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, ['die-a']);
      beMyself('the-master');
      PeerCursor.myCursor = { role: PeerRole.GameMaster } as PeerCursor;

      expect(lineEdit.discloseDieRolls('die-a')).toBe(1);
      expect(secret.isSecret).toBe(false);
    });

    it('finds the throw in whichever tab it was said in', () => {
      const another = ChatTabList.instance.addChatTab('べつのタブ');
      try {
        const secret = chat.sendSecretSystemMessageToTab(another, '隠しダイス → 6', 'me', undefined, ['die-a']);

        lineEdit.discloseDieRolls('die-a');

        expect(secret.isSecret).toBe(false);
      } finally {
        another.destroy();
      }
    });
  });
});
