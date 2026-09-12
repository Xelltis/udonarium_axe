import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { VisualNovelSettingsService } from '@axe/features/visual-novel/visual-novel-settings.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VisualNovelPlaybackService', () => {
  let playback: VisualNovelPlaybackService;
  let settings: VisualNovelSettingsService;
  let tab: ChatTab;
  let character: GameCharacter;
  let timestamp = 1000;

  function say(text: string, sendFrom: string, extra: Record<string, unknown> = {}): void {
    tab.addMessage({ from: 'test-user', name: text, text, timestamp: timestamp++, sendFrom, ...extra });
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    // `createMyCursor` hands back the cursor it made for an earlier test, which the store it
    // was put in no longer holds. Who spoke a line is looked up there, so it has to be back.
    if (!ObjectStore.instance.get(PeerCursor.myCursor.identifier)) PeerCursor.myCursor.initialize();
    tab = ChatTabList.instance.addChatTab('テストタブ');
    character = GameCharacter.create('ミナ', 1, ImageStorage.instance.add('test://vn/mina.png').identifier);
    settings = TestBed.inject(VisualNovelSettingsService);
    playback = TestBed.inject(VisualNovelPlaybackService);
    playback.setChatTab(tab.identifier);
  });

  afterEach(() => {
    character?.destroy();
    tab?.destroy();
    PeerCursor.myCursor.role = PeerRole.Player;
    localStorage.removeItem('vn-settings');
  });

  it('passes over what a player says as themselves, and keeps it in the log', () => {
    say('なんだって！？', character.identifier);
    say('ちょっと待って', PeerCursor.myCursor.identifier);
    TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

    expect(playback.logMessages().map((message) => message.text)).toEqual(['なんだって！？', 'ちょっと待って']);
    expect(playback.messages().map((message) => message.text)).toEqual(['なんだって！？']);
  });

  describe('a line kept secret', () => {
    function beMe(userId: string): void {
      const me = { userId } as IPeerContext;
      setPeerContextProvider({ peerContext: me, peerContexts: [me], peerIds: [userId], peerId: userId });
    }

    function saySecret(text: string, from: string): void {
      tab.addMessage({
        from,
        name: text,
        text,
        timestamp: timestamp++,
        sendFrom: character.identifier,
        tag: 'system-message secret',
      });
    }

    it('leaves a secret roll out of the script for the room', () => {
      beMe('reader');
      saySecret('隠しダイス → 6', 'roller');
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

      expect(playback.logMessages()).toHaveLength(0);
    });

    it('leaves it out on the screen of the one who made it, who has the chat window for it', () => {
      beMe('roller');
      saySecret('隠しダイス → 6', 'roller');
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

      expect(playback.logMessages()).toHaveLength(0);
    });

    it('leaves it out for the game master as well', () => {
      beMe('reader');
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      saySecret('隠しダイス → 6', 'roller');
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

      expect(playback.logMessages()).toHaveLength(0);
    });

    it('reads an opened line after everything said while it was kept back', () => {
      beMe('reader');
      saySecret('隠しダイス → 6', 'roller');
      const secret = tab.chatMessages[tab.chatMessages.length - 1];
      say('その間の発言', character.identifier);

      beMe('roller');
      TestBed.inject(ChatMessageService).discloseMessage(secret);
      beMe('reader');
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

      expect(playback.messages().map((message) => message.text)).toEqual(['その間の発言', '隠しダイス → 6']);
      expect(playback.currentMessage()).toBe(secret);
    });

    it('shows it once it has been opened to the table', () => {
      beMe('reader');
      saySecret('隠しダイス → 6', 'roller');
      const message = tab.chatMessages[tab.chatMessages.length - 1];
      message.tag = 'system-message';
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

      expect(playback.logMessages()).toHaveLength(1);
    });
  });

  it('reads what the game master says as themselves', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    say('では、判定を', PeerCursor.myCursor.identifier);
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);

    expect(playback.messages()).toHaveLength(1);
  });

  it('reads a line with nobody recorded as having said it', () => {
    say('むかしむかし', '');
    expect(playback.messages()).toHaveLength(1);
  });

  it('reads everything once the reader asks for it', () => {
    say('ちょっと待って', PeerCursor.myCursor.identifier);
    expect(playback.messages()).toHaveLength(0);

    settings.setReadPlayerAsides(true);

    expect(playback.messages()).toHaveLength(1);
  });

  describe('what a line says about who spoke it', () => {
    it('keeps a game master line in the story after they hand over the seat', () => {
      say('では、判定を', PeerCursor.myCursor.identifier, { senderRole: PeerRole.GameMaster });

      PeerCursor.myCursor.role = PeerRole.Player;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);

      expect(playback.messages().map((message) => message.text)).toEqual(['では、判定を']);
    });

    it('keeps a player aside out of the story once their cursor is gone', () => {
      say('ちょっと待って', PeerCursor.myCursor.identifier, { senderRole: PeerRole.Player });

      // A reconnect builds a new cursor, so the one the line names is no longer on the table.
      ObjectStore.instance.delete(PeerCursor.myCursor, false);
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

      expect(playback.messages()).toHaveLength(0);
    });

    it('still reads a line from a room that recorded no role at all', () => {
      say('むかしむかし', PeerCursor.myCursor.identifier);
      ObjectStore.instance.delete(PeerCursor.myCursor, false);
      TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

      expect(playback.messages()).toHaveLength(1);
    });
  });

  it('starts at the scene when the line picked out has nothing before it', () => {
    // The tab opens on an aside, which the script passes over, and a scene line follows it.
    say('ちょっと待って', PeerCursor.myCursor.identifier, { senderRole: PeerRole.Player });
    say('では、始めよう', character.identifier);
    say('こんにちは', character.identifier);
    TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);
    const aside = playback.logMessages()[0];

    playback.jumpToIdentifier(aside.identifier);

    expect(playback.currentMessage()?.text).toBe('では、始めよう');
  });

  it('keeps a roll and the line it was asked for on', () => {
    const player = PeerCursor.myCursor.identifier;
    say('2d6', player);
    tab.addMessage({
      from: 'System-BCDice',
      originFrom: 'test-user',
      name: 'system',
      text: '2d6 → 9',
      timestamp: timestamp - 1 + 1,
      tag: 'system',
    });
    TestBed.inject(ObjectChangeService).notifyChanged(tab.identifier);

    expect(playback.messages().map((message) => message.text)).toEqual(['2d6', '2d6 → 9']);
  });
});
