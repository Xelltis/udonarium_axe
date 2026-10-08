import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function addReady(...identifiers: string[]): void {
  for (const identifier of identifiers) {
    const audio = AudioFile.createEmpty(identifier);
    const context = (audio as unknown as { context: Record<string, unknown> }).context;
    context['blob'] = new Blob(['x']);
    context['url'] = 'blob:x';
    AudioStorage.instance.add(audio);
  }
}

describe('JukeboxPlaybackService', () => {
  let service: JukeboxPlaybackService;
  let jukebox: Jukebox;
  let launcher: CutInLauncher;
  let first: Playlist;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    launcher = new CutInLauncher('CutInLauncher');
    launcher.initialize();
    first = new Playlist(Playlist.DEFAULT_IDENTIFIER);
    first.initialize();
    service = TestBed.inject(JukeboxPlaybackService);
    vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
    vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
    vi.spyOn(AudioPlayer.prototype, 'seekTo').mockImplementation(() => {});
  });

  afterEach(() => {
    AudioStorage.instance.audios.forEach((audio) => AudioStorage.instance.delete(audio.identifier));
    vi.restoreAllMocks();
  });

  describe('the name a playlist goes by', () => {
    it('is the one it was given', () => {
      expect(service.labelOf(Playlist.create('Battle'))).toBe('Battle');
    });

    it('is a stand-in for the room’s first until it is named', () => {
      const t = TestBed.inject(TRANSLATE_FN);

      expect(service.labelOf(first)).toBe(t('feature.media.jukebox.playlistDefaultName'));
    });

    it('is a stand-in for one that came without a name', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const made = Playlist.create('');

      expect(service.labelOf(made)).toBe(t('feature.media.jukebox.playlistUntitled'));
    });
  });

  describe('play and pause', () => {
    it('pauses what is playing', () => {
      addReady('a');
      jukebox.play('a');

      service.togglePlayPause();

      expect(jukebox.isPaused).toBe(true);
    });

    it('goes on with what is paused', () => {
      addReady('a');
      jukebox.play('a');
      jukebox.pause();

      service.togglePlayPause();

      expect(jukebox.isPlaying).toBe(true);
      expect(jukebox.audioIdentifier).toBe('a');
    });

    it('starts the playlist when nothing is held, stopping the cut-ins that have no tag first', () => {
      addReady('a', 'b');
      first.entries = ['a', 'b'];
      const stopCutIns = vi.spyOn(launcher, 'stopBlankTagCutIn').mockImplementation(() => {});

      service.togglePlayPause();

      expect(stopCutIns).toHaveBeenCalledOnce();
      expect(jukebox.audioIdentifier).toBe('a');
    });
  });

  describe('moving between playlists', () => {
    it('starts the next playlist, going round to the first after the last', async () => {
      addReady('a', 'x');
      first.entries = ['a'];
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const battle = Playlist.create('Battle');
      battle.entries = ['x'];
      await Promise.resolve();

      service.stepPlaylist(1);
      expect(jukebox.playlistIdentifier).toBe(battle.identifier);
      expect(jukebox.audioIdentifier).toBe('x');

      await Promise.resolve();
      service.stepPlaylist(1);
      expect(jukebox.playlistIdentifier).toBe(first.identifier);
      expect(jukebox.audioIdentifier).toBe('a');
    });

    it('starts the previous playlist, going round to the last before the first', async () => {
      addReady('x');
      const battle = Playlist.create('Battle');
      battle.entries = ['x'];
      await Promise.resolve();

      service.stepPlaylist(-1);

      expect(jukebox.playlistIdentifier).toBe(battle.identifier);
    });

    it('stays put with only one playlist', () => {
      service.stepPlaylist(1);

      expect(jukebox.playlistIdentifier).toBe('');
    });
  });

  describe('what each role may change', () => {
    let logged: string[];

    function playAs(role: PeerRole, name = 'Alice'): void {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = role;
      PeerCursor.myCursor.name = name;
    }

    beforeEach(() => {
      logged = [];
      vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockImplementation((text: string) => {
        logged.push(decodeI18nMessage(text, TestBed.inject(TRANSLATE_FN)));
        return {} as ChatMessage;
      });
    });

    it('lets a guest only listen, leaving the room’s music as it is', () => {
      addReady('a', 'b');
      first.entries = ['a', 'b'];
      jukebox.play('a');
      playAs(PeerRole.Guest);

      service.togglePlayPause();
      service.next();
      service.previous();
      service.play(AudioStorage.instance.get('b')!);
      service.playFromPlaylist(first, AudioStorage.instance.get('b')!);
      service.seek(10);
      service.stop();

      expect(service.canOperate()).toBe(false);
      expect(jukebox.isPlaying).toBe(true);
      expect(jukebox.audioIdentifier).toBe('a');
      expect(AudioPlayer.prototype.seekTo).not.toHaveBeenCalled();
    });

    it('lets a player play and stop, but not turn shuffle or repeat', () => {
      addReady('a');
      playAs(PeerRole.Player);

      service.play(AudioStorage.instance.get('a')!);
      expect(jukebox.audioIdentifier).toBe('a');
      service.cycleRepeatMode();
      service.toggleShuffle();

      expect(service.canOperate()).toBe(true);
      expect(service.canChangeModes()).toBe(false);
      expect(jukebox.repeatMode).toBe('one');
      expect(jukebox.shuffles).toBe(false);
      expect(logged).toEqual([]);
    });

    it('writes each turn of repeat by the game master to the system log, naming them', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      playAs(PeerRole.GameMaster, 'Gina');

      service.cycleRepeatMode();
      service.cycleRepeatMode();
      service.cycleRepeatMode();

      expect(jukebox.repeatMode).toBe('one');
      expect(logged).toEqual([
        t('feature.media.jukebox.log.repeatNone', { name: 'Gina' }),
        t('feature.media.jukebox.log.repeatAll', { name: 'Gina' }),
        t('feature.media.jukebox.log.repeatOne', { name: 'Gina' }),
      ]);
    });

    it('writes each turn of shuffle by the game master to the system log, naming them', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      playAs(PeerRole.GameMaster, 'Gina');

      service.toggleShuffle();
      service.toggleShuffle();

      expect(jukebox.shuffles).toBe(false);
      expect(logged).toEqual([
        t('feature.media.jukebox.log.shuffleOn', { name: 'Gina' }),
        t('feature.media.jukebox.log.shuffleOff', { name: 'Gina' }),
      ]);
    });
  });

  it('remembers how long a paused track is, for the time it shows', () => {
    addReady('a');
    jukebox.play('a');
    vi.spyOn(Jukebox.prototype, 'duration', 'get').mockReturnValue(200);
    expect(service.duration()).toBe(200);
    vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(30);
    jukebox.pause();
    vi.spyOn(Jukebox.prototype, 'duration', 'get').mockReturnValue(NaN);

    expect(service.duration()).toBe(200);
    expect(service.position()).toBe(30);
  });
});
