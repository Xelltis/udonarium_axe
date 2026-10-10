import { TestBed } from '@angular/core/testing';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PresetSound } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ChatSoundEventHandlerService } from '@axe/features/chat/chat-sound-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatSoundEventHandlerService', () => {
  let played: { identifier: string; volume: number }[];

  function makeTab(name: string): ChatTab {
    const tab = new ChatTab();
    tab.name = name;
    tab.initialize();
    return ChatTabList.instance.appendChild(tab)!;
  }

  function start(): ChatSoundEventHandlerService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    return TestBed.inject(ChatSoundEventHandlerService);
  }

  function speak(tab: ChatTab, text: string, from = 'someone-else', tag = '', timestamp = Date.now()): void {
    tab.addMessage({ from, name: '誰か', text, tag, timestamp });
  }

  function enable(setting: Record<string, unknown>): void {
    localStorage.setItem('chat-preferences', JSON.stringify({ sound: setting }));
  }

  beforeEach(() => {
    localStorage.clear();
    played = [];
    vi.spyOn(AudioStorage.prototype, 'get').mockImplementation(
      (identifier: string) => ({ identifier }) as unknown as AudioFile
    );
    vi.spyOn(AudioPlayer, 'play').mockImplementation((audio: AudioFile, volume = 1) => {
      played.push({ identifier: audio.identifier, volume });
    });
    PresetSound.chatBubble = 'bubble';
    PresetSound.chatCyber = 'cyber';
    PresetSound.chatNotify1 = 'notify1';
    setPeerContextProvider({
      peerContext: { userId: 'me', peerId: 'me/peer' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'me/peer',
    });
    ChatTabList.instance.initialize();
    PeerCursor.createMyCursor();
  });

  afterEach(() => {
    resetPeerContextProvider();
    vi.restoreAllMocks();
    localStorage.clear();
    for (const tab of [...ChatTabList.instance.chatTabs]) tab.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) {
      ObjectStore.instance.delete(cursor, false);
    }
    ObjectStore.instance.clearDeleteHistory();
    PeerCursor.myCursor = null!;
  });

  it('says nothing while nobody asked it to', () => {
    start();
    speak(makeTab('メイン'), 'こんばんは');

    expect(played).toEqual([]);
  });

  it('sounds the note the room is set to, at the volume it is set to', () => {
    enable({ scope: 'all', all: { enabled: true, volume: 0.3, type: 'bubble' }, tabs: {} });
    start();

    speak(makeTab('メイン'), 'こんばんは');

    expect(played).toEqual([{ identifier: 'bubble', volume: 0.3 }]);
  });

  it('stays quiet for what the reader said themselves', () => {
    enable({ scope: 'all', all: { enabled: true, volume: 0.5, type: 'bubble' }, tabs: {} });
    start();

    speak(makeTab('メイン'), 'こんばんは', 'me');

    expect(played).toEqual([]);
  });

  it('leaves what the room says of itself to the sounds it already carries', () => {
    enable({ scope: 'all', all: { enabled: true, volume: 0.5, type: 'bubble' }, tabs: {} });
    start();

    speak(makeTab('メイン'), '1d100 → 42', 'System-BCDice', 'system');

    expect(played).toEqual([]);
  });

  it('gives a tab its own note once the answers differ per tab', () => {
    enable({
      scope: 'perTab',
      all: { enabled: false, volume: 0.5, type: 'bubble' },
      tabs: { 雑談: { enabled: true, volume: 0.8, type: 'cyber' } },
    });
    start();

    const main = makeTab('メイン');
    const small = makeTab('雑談');
    speak(main, 'こんばんは');
    speak(small, 'こんばんは');

    expect(played).toEqual([{ identifier: 'cyber', volume: 0.8 }]);
  });

  it('sounds the note the system tab is set to for a notice the room posts there', () => {
    enable({
      scope: 'perTab',
      all: { enabled: true, volume: 0.5, type: 'bubble' },
      tabs: { システム: { enabled: true, volume: 0.3, type: 'cyber' } },
    });
    start();

    speak(makeTab('システム'), '誰か が入室しました', undefined, 'system-message');

    expect(played).toEqual([{ identifier: 'cyber', volume: 0.3 }]);
  });

  it('says nothing for an evening of talk handed over on joining', () => {
    enable({ scope: 'all', all: { enabled: true, volume: 0.5, type: 'bubble' }, tabs: {} });
    start();

    const main = makeTab('メイン');
    for (const line of ['ひとつ', 'ふたつ', 'みっつ']) speak(main, line, 'someone-else', '', Date.now() - 600_000);

    expect(played).toEqual([]);
  });

  it('says nothing of a tab the reader may not read', () => {
    enable({ scope: 'all', all: { enabled: true, volume: 0.5, type: 'bubble' }, tabs: {} });
    start();

    const secret = makeTab('GM');
    secret.plCanView = false;
    PeerCursor.myCursor.role = PeerRole.Player;
    speak(secret, 'こんばんは');

    expect(played).toEqual([]);
  });

  it('stays quiet for a line when the volume is set to nothing', () => {
    enable({ scope: 'all', all: { enabled: true, volume: 0, type: 'notify1' }, tabs: {} });
    start();

    speak(makeTab('メイン'), 'こんばんは');

    expect(played).toEqual([]);
  });

  it('plays a line’s note through the notification channel', () => {
    enable({ scope: 'all', all: { enabled: true, volume: 0.4, type: 'notify1' }, tabs: {} });
    start();

    speak(makeTab('メイン'), 'こんばんは');

    expect(AudioPlayer.play).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'notify1' }),
      0.4,
      VolumeType.NOTIFICATION
    );
  });

  it('falls back to what the room is set to for a tab with no answer of its own', () => {
    enable({
      scope: 'perTab',
      all: { enabled: true, volume: 0.4, type: 'notify1' },
      tabs: {},
    });
    start();

    speak(makeTab('メイン'), 'こんばんは');

    expect(played).toEqual([{ identifier: 'notify1', volume: 0.4 }]);
  });
});
