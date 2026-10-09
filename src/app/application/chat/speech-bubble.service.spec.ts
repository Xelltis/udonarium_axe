import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SPEECH_BUBBLE_WAIT_MS, SpeechBubbleService } from '@axe/application/chat/speech-bubble.service';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage, ChatMessageContext } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { SPEECH_BUBBLE_LIMIT } from '@axe/domain/chat/speech-bubble';
import { Config } from '@axe/domain/peer/config';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SpeechBubbleService', () => {
  let service: SpeechBubbleService;
  let tab: ChatTab;
  let hero: GameCharacter;
  const characters: GameCharacter[] = [];

  function character(name: string): GameCharacter {
    const made = GameCharacter.create(name, 1, '');
    characters.push(made);
    return made;
  }

  function say(by: GameCharacter, text: string, fields: Partial<ChatMessageContext> = {}): ChatMessage {
    return tab.addMessage({
      from: 'me',
      sendFrom: by.identifier,
      name: by.name,
      text,
      timestamp: Date.now(),
      ...fields,
    });
  }

  /** Lets the store announce what changed, which it gathers up and sends after the current task. */
  async function changesAnnounced(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  function bubbleText(of: GameCharacter): string | null {
    return service.bubbleOf(of.identifier)()?.text ?? null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    setPeerContextProvider({
      peerContext: { userId: 'me', peerId: 'me/peer' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'me/peer',
    });
    ChatTabList.instance.initialize();
    tab = new ChatTab();
    tab.initialize();
    ChatTabList.instance.appendChild(tab);
    vi.spyOn(TestBed.inject(ChatMessageService), 'getTime').mockImplementation(() => Date.now());
    service = TestBed.inject(SpeechBubbleService);
    hero = character('ヒロ');
  });

  afterEach(() => {
    service.clear();
    for (const made of characters.splice(0)) made.destroy();
    for (const chatTab of [...ChatTabList.instance.chatTabs]) chatTab.destroy();
    Config.instance.speechBubblesEnabled = true;
    resetPeerContextProvider();
    vi.useRealTimers();
  });

  it('brings what a character on the table says up over it after a moment, and takes it down after its time', () => {
    say(hero, '剣を抜く。「かかってこい！」');
    expect(bubbleText(hero)).toBeNull();

    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
    expect(bubbleText(hero)).toBe('かかってこい！');

    vi.advanceTimersByTime(10_000);
    expect(bubbleText(hero)).toBeNull();
  });

  it('brings up the stamp a character sends', () => {
    say(hero, '[OK]', { stamp: 'seal:ok' });
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);

    expect(service.bubbleOf(hero.identifier)()).toEqual(expect.objectContaining({ text: '', stamp: 'seal:ok' }));
  });

  it('brings nothing up for a line the tool answers as a roll, and takes one down that it answers late', () => {
    const roll = say(hero, '2d6');
    tab.addMessage({
      from: 'System-BCDice',
      originFrom: 'me',
      tag: 'system',
      name: '<BCDice：ヒロ>',
      text: '(2D6) → 7',
      timestamp: roll.timestamp + 1,
    });
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
    expect(bubbleText(hero)).toBeNull();

    const change = say(hero, ':HP-3', { timestamp: Date.now() + 50 });
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
    expect(bubbleText(hero)).toBe(':HP-3');
    tab.addMessage({
      from: 'System',
      originFrom: 'me',
      tag: 'system',
      name: 'ヒロ',
      text: 'HP 10 → 7',
      timestamp: change.timestamp + 2,
    });
    expect(bubbleText(hero)).toBeNull();
  });

  it('brings nothing up for a whisper, a secret, a line from before, or a piece off the table', () => {
    say(hero, 'ひみつ', { to: 'you' });
    say(hero, 'しーっ', { tag: 'secret' });
    say(hero, 'むかしむかし', { timestamp: Date.now() - 60_000 });
    const away = character('不在');
    away.setLocation('graveyard');
    say(away, 'ここにいない');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);

    expect(bubbleText(hero)).toBeNull();
    expect(bubbleText(away)).toBeNull();
  });

  it('brings nothing up from a tab this reader may not read', () => {
    tab.plCanView = false;
    say(hero, '内緒の相談');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);

    expect(bubbleText(hero)).toBeNull();
  });

  it('takes a bubble down when its line is deleted, and shows the new words of an edited one', async () => {
    const line = say(hero, 'こんにちは');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);

    line.edit('こんばんは', '', Date.now());
    await changesAnnounced();
    expect(bubbleText(hero)).toBe('こんばんは');

    line.pseudoDelete(Date.now());
    await changesAnnounced();
    expect(bubbleText(hero)).toBeNull();
  });

  it('replaces a piece’s bubble with its next line, and lets the longest shown give way past the limit', () => {
    say(hero, 'ひとつめ');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
    say(hero, 'ふたつめ');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
    expect(bubbleText(hero)).toBe('ふたつめ');

    const others = Array.from({ length: SPEECH_BUBBLE_LIMIT }, (_, index) => character(`脇役${index}`));
    for (const other of others) say(other, 'はい');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);

    expect(bubbleText(hero)).toBeNull();
    expect(others.every((other) => bubbleText(other) === 'はい')).toBe(true);
  });

  it('brings nothing up in a room that turned bubbles off, and takes them down when it does', async () => {
    say(hero, 'こんにちは');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
    expect(bubbleText(hero)).toBe('こんにちは');

    Config.instance.speechBubblesEnabled = false;
    await changesAnnounced();
    expect(bubbleText(hero)).toBeNull();

    say(hero, 'もう一度');
    vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
    expect(bubbleText(hero)).toBeNull();
  });
});
