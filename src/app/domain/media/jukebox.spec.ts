import { TestBed } from '@angular/core/testing';
import { MusicBus } from '@axe/core/audio/music-bus';
import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { LoopPlayer } from '@axe/core/storage/loop-player';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AUDIO_ANALYSIS_VERSION, type AudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { DEFAULT_DJ_SETTINGS, type DjSettings } from '@axe/domain/media/dj-settings';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { Config } from '@axe/domain/peer/config';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeAudioFile(opts: { blob?: Blob | null; url?: string; identifier?: string } = {}): AudioFile {
  const identifier = opts.identifier ?? 'test-audio';
  const audio = AudioFile.createEmpty(identifier);
  const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
  ctx['blob'] = opts.blob ?? null;
  ctx['url'] = opts.url ?? '';
  return audio;
}

function makeReadyAudio(identifier: string): AudioFile {
  return makeAudioFile({ identifier, blob: new Blob(['x']), url: 'blob:x' });
}

/** The player is mocked, so no audio context is needed. */
function stubAudioPlayerPlay() {
  return vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
}
function stubAudioPlayerStop() {
  return vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
}

describe('Jukebox', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    AudioStorage.instance.audios.forEach((a) => AudioStorage.instance.delete(a.identifier));
    vi.restoreAllMocks();
  });

  describe('the defaults of the synchronised fields', () => {
    it('names no track', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.audioIdentifier).toBe('');
    });

    it('starts at the beginning', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.startTime).toBe(0);
    });

    it('starts repeating one track', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.repeatMode).toBe('one');
    });

    it('starts stopped', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.isPlaying).toBe(false);
    });
  });

  describe('volume', () => {
    it('starts at half', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.volume).toBe(0.5);
    });

    it('takes a value', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      jukebox.volume = 0.8;
      expect(jukebox.volume).toBe(0.8);
    });
  });

  describe('auditionVolume', () => {
    it('starts at half', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.auditionVolume).toBe(0.5);
    });

    it('takes a value', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      jukebox.auditionVolume = 0.3;
      expect(jukebox.auditionVolume).toBe(0.3);
    });
  });

  describe('seVolume', () => {
    it('starts at half', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.seVolume).toBe(0.5);
    });

    it('takes a value', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      jukebox.seVolume = 0.7;
      expect(jukebox.seVolume).toBe(0.7);
    });
  });

  describe('stop', () => {
    it('clears the track and stops on a stop', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      jukebox.audioIdentifier = 'some-audio';
      jukebox.isPlaying = true;
      jukebox.stop();
      expect(jukebox.audioIdentifier).toBe('');
      expect(jukebox.isPlaying).toBe(false);
    });
  });

  describe('play()', () => {
    it('plays a track that is ready and names it', () => {
      const playSpy = stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      const audio = makeReadyAudio('bgm-01');
      AudioStorage.instance.add(audio);

      jukebox.play('bgm-01', true);

      expect(jukebox.audioIdentifier).toBe('bgm-01');
      expect(jukebox.isPlaying).toBe(true);
      expect(playSpy).toHaveBeenCalledOnce();
    });

    it('plays nothing for a track the storage does not hold', () => {
      const playSpy = stubAudioPlayerPlay();
      const jukebox = new Jukebox();
      jukebox.initialize();

      jukebox.play('not-exist');

      expect(jukebox.isPlaying).toBe(false);
      expect(playSpy).not.toHaveBeenCalled();
    });

    it('plays nothing for a track that is not ready', () => {
      const playSpy = stubAudioPlayerPlay();
      const jukebox = new Jukebox();
      jukebox.initialize();

      const audio = makeAudioFile({ identifier: 'null-audio' }); // blob=null, url=''
      AudioStorage.instance.add(audio);

      jukebox.play('null-audio');

      expect(jukebox.isPlaying).toBe(false);
      expect(playSpy).not.toHaveBeenCalled();
    });
  });

  describe('telling a sound effect from music', () => {
    it('plays an untagged track through the master volume, looping', () => {
      const playSpy = stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      const audio = makeReadyAudio('bgm-02');
      AudioStorage.instance.add(audio);

      jukebox.repeatMode = 'one';
      jukebox.play('bgm-02');

      const player = (jukebox as unknown as { audioPlayer: AudioPlayer }).audioPlayer;
      expect(player.volumeType).toBe(VolumeType.MASTER);
      expect(player.loop).toBe(true);
      expect(player.followsLoopPoints).toBe(true);
      expect(playSpy).toHaveBeenCalledOnce();
    });

    it('lays a sound effect over the music rather than stopping it', () => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const seSpy = vi.spyOn(AudioPlayer, 'playSE').mockImplementation(() => {});
      const jukebox = new Jukebox();
      jukebox.initialize();

      AudioStorage.instance.add(makeReadyAudio('bgm-01'));
      jukebox.play('bgm-01');
      expect(jukebox.audioIdentifier).toBe('bgm-01');
      expect(jukebox.isPlaying).toBe(true);

      const seAudio = makeReadyAudio('se-01');
      AudioStorage.instance.add(seAudio);
      AudioTag.create('se-01').tag = 'SE';
      jukebox.play('se-01', true);

      // the music plays on untouched
      expect(jukebox.audioIdentifier).toBe('bgm-01');
      expect(jukebox.isPlaying).toBe(true);
      // the effect syncs on its own trigger and plays from its own buffer
      expect(jukebox.seIdentifier).toBe('se-01');
      expect(jukebox.seTrigger).toBe(1);
      expect(seSpy).toHaveBeenCalledWith(seAudio, 1);

      // lays a second playing over the first rather than stopping it
      jukebox.play('se-01');
      expect(jukebox.seTrigger).toBe(2);
      expect(seSpy).toHaveBeenCalledTimes(2);
      expect(jukebox.audioIdentifier).toBe('bgm-01');
    });

    it('stops an effect and syncs the stop', () => {
      const stopSpy = vi.spyOn(AudioPlayer, 'stopSE').mockImplementation(() => {});
      const jukebox = new Jukebox();
      jukebox.initialize();

      jukebox.stopSE('se-01');

      expect(stopSpy).toHaveBeenCalledWith('se-01');
      expect(jukebox.seStopIdentifier).toBe('se-01');
      expect(jukebox.seStopTrigger).toBe(1);
    });

    it('stops an effect at this end when that trigger changes', () => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const stopSpy = vi.spyOn(AudioPlayer, 'stopSE').mockImplementation(() => {});
      const jukebox = new Jukebox();
      jukebox.initialize();
      (jukebox as unknown as { isInitialSync: boolean }).isInitialSync = false;

      const context = jukebox.toContext();
      context.syncData = { ...context.syncData, seStopIdentifier: 'se-99', seStopTrigger: 5 };
      jukebox.apply(context);

      expect(stopSpy).toHaveBeenCalledWith('se-99');
    });
  });

  describe('playAfterFileUpdate()', () => {
    it('waits for the track to be ready before playing it', () => {
      const playSpy = stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      // a file with nothing in it is added
      const audio = makeAudioFile({ identifier: 'lazy-audio' });
      AudioStorage.instance.add(audio);

      // it is not ready, so the play is put off until the file updates
      jukebox.audioIdentifier = 'lazy-audio';
      jukebox.isPlaying = true;
      jukebox.repeatMode = 'one';
      // played directly
      (jukebox as unknown as { _play: () => void })._play();

      expect(playSpy).not.toHaveBeenCalled();

      // the file is made ready and the update announced
      const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
      ctx['blob'] = new Blob(['data']);
      ctx['url'] = 'blob:data';
      updateAudioResource$.emit();

      expect(playSpy).toHaveBeenCalledOnce();
    });
  });

  describe('starting the track on a gesture', () => {
    const TRACK = 'bgm-gesture';

    function playerThatTheBrowserMayRefuse() {
      const browser = { allowsPlayback: false, canPlayTrack: true };
      const sounding = new WeakSet<AudioPlayer>();
      const refused = new WeakSet<AudioPlayer>();
      stubAudioPlayerStop();
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(function (this: AudioPlayer) {
        sounding.delete(this);
        refused.delete(this);
        if (!browser.allowsPlayback) refused.add(this);
        else if (browser.canPlayTrack) sounding.add(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'paused', 'get').mockImplementation(function (this: AudioPlayer) {
        return !sounding.has(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'isAwaitingGesture', 'get').mockImplementation(function (this: AudioPlayer) {
        return refused.has(this);
      });
      return browser;
    }

    function joinRoomPlaying(): { jukebox: Jukebox; playSpy: ReturnType<typeof vi.fn> } {
      const jukebox = new Jukebox();
      jukebox.initialize();
      AudioStorage.instance.add(makeReadyAudio(TRACK));
      const context = jukebox.toContext();
      context.syncData = { ...context.syncData, audioIdentifier: TRACK, isPlaying: true };
      jukebox.apply(context);
      const playSpy = vi.spyOn(jukebox as unknown as { _play: () => void }, '_play');
      return { jukebox, playSpy: playSpy as unknown as ReturnType<typeof vi.fn> };
    }

    function lift() {
      document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
    }

    it('tries again on a later tap when the gesture that ended a pan could not start the track', () => {
      const browser = playerThatTheBrowserMayRefuse();
      const { jukebox, playSpy } = joinRoomPlaying();

      lift();
      expect(playSpy).toHaveBeenCalledTimes(1);

      browser.allowsPlayback = true;
      lift();
      expect(playSpy).toHaveBeenCalledTimes(2);

      lift();
      expect(playSpy).toHaveBeenCalledTimes(2);
      jukebox.destroy();
    });

    it('leaves a track that is already sounding where it is', () => {
      const browser = playerThatTheBrowserMayRefuse();
      browser.allowsPlayback = true;
      const { jukebox, playSpy } = joinRoomPlaying();

      lift();

      expect(playSpy).not.toHaveBeenCalled();
      jukebox.destroy();
    });

    it('does not try again a track that failed for a reason a gesture cannot help', () => {
      const browser = playerThatTheBrowserMayRefuse();
      browser.allowsPlayback = true;
      browser.canPlayTrack = false;
      const { jukebox, playSpy } = joinRoomPlaying();

      lift();
      lift();

      expect(playSpy).not.toHaveBeenCalled();
      jukebox.destroy();
    });

    it('tries a track the room starts after a gesture that came while the room was silent', () => {
      const browser = playerThatTheBrowserMayRefuse();
      const jukebox = new Jukebox();
      jukebox.initialize();
      AudioStorage.instance.add(makeReadyAudio(TRACK));

      lift();
      const context = jukebox.toContext();
      context.syncData = { ...context.syncData, audioIdentifier: TRACK, isPlaying: true };
      jukebox.apply(context);
      const playSpy = vi.spyOn(jukebox as unknown as { _play: () => void }, '_play');

      browser.allowsPlayback = true;
      lift();
      lift();

      expect(playSpy).toHaveBeenCalledTimes(1);
      jukebox.destroy();
    });

    it('lets go of the gestures once it leaves the room', () => {
      playerThatTheBrowserMayRefuse();
      const { jukebox, playSpy } = joinRoomPlaying();

      jukebox.destroy();
      lift();

      expect(playSpy).not.toHaveBeenCalled();
    });

    it('waits for a file still arriving without starting again, then tries once the browser refused it', () => {
      playerThatTheBrowserMayRefuse();
      const jukebox = new Jukebox();
      jukebox.initialize();
      const audio = makeAudioFile({ identifier: 'bgm-arriving' });
      AudioStorage.instance.add(audio);
      const context = jukebox.toContext();
      context.syncData = { ...context.syncData, audioIdentifier: 'bgm-arriving', isPlaying: true };
      jukebox.apply(context);
      const playSpy = vi.spyOn(jukebox as unknown as { _play: () => void }, '_play');

      lift();
      lift();
      expect(playSpy).not.toHaveBeenCalled();

      const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
      ctx['blob'] = new Blob(['data']);
      ctx['url'] = 'blob:data';
      updateAudioResource$.emit();
      lift();
      expect(playSpy).toHaveBeenCalledTimes(1);
      jukebox.destroy();
    });
  });

  describe('setNewVolume()', () => {
    function channelVolumes() {
      // The channel setter reaches for an audio context, so it is stubbed.
      const set = vi.spyOn(AudioPlayer, 'setChannelVolume').mockImplementation(() => {});
      return (type: VolumeType) => set.mock.calls.filter(([called]) => called === type).at(-1)?.[1];
    }

    function makeJukeboxInRoomAt(roomVolume: number): Jukebox {
      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      const config = new Config('Config');
      config.initialize();
      config.roomVolume = roomVolume;
      return jukebox;
    }

    it('multiplies the room volume into this peer’s level for each channel', () => {
      const heard = channelVolumes();
      const jukebox = makeJukeboxInRoomAt(0.8);
      jukebox.volume = 0.5;
      jukebox.auditionVolume = 0.6;
      jukebox.seVolume = 0.7;
      jukebox.backgroundVolume = 0.25;

      jukebox.setNewVolume();

      expect(heard(VolumeType.MASTER)).toBeCloseTo(0.4);
      expect(heard(VolumeType.AUDITION)).toBeCloseTo(0.48);
      expect(heard(VolumeType.SE)).toBeCloseTo(0.56);
      expect(heard(VolumeType.BACKGROUND)).toBeCloseTo(0.2);
    });

    it('carries the channels split off from the sound effects too, at half until set', () => {
      const heard = channelVolumes();
      const jukebox = makeJukeboxInRoomAt(0.5);
      jukebox.setLevel(VolumeType.HANDLING, 0);

      jukebox.setNewVolume();

      expect(heard(VolumeType.HANDLING)).toBe(0);
      expect(heard(VolumeType.CUT_IN)).toBeCloseTo(0.25);
      expect(heard(VolumeType.NOTIFICATION)).toBeCloseTo(0.25);
      expect(heard(VolumeType.EFFECT)).toBeCloseTo(0.25);
    });

    it('multiplies in the room’s volume for each kind on top of its overall volume, but not into previews', () => {
      const heard = channelVolumes();
      const jukebox = makeJukeboxInRoomAt(0.5);
      const config = jukebox.config;
      config.setRoomVolumeOf('bgm', 1.6);
      config.setRoomVolumeOf('background', 0.5);
      config.setRoomVolumeOf('handling', 0);
      jukebox.volume = 0.5;
      jukebox.auditionVolume = 0.5;
      jukebox.backgroundVolume = 0.8;

      jukebox.setNewVolume();

      expect(heard(VolumeType.MASTER)).toBeCloseTo(0.4);
      expect(heard(VolumeType.BACKGROUND)).toBeCloseTo(0.2);
      expect(heard(VolumeType.HANDLING)).toBe(0);
      expect(heard(VolumeType.SE)).toBeCloseTo(0.25);
      expect(heard(VolumeType.AUDITION)).toBeCloseTo(0.25);
    });
  });

  describe('background sounds', () => {
    beforeEach(() => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      vi.spyOn(LoopPlayer.prototype, 'start').mockImplementation(() => {});
    });

    it('keeps this peer’s background volume, starting at half', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      expect(jukebox.backgroundVolume).toBe(0.5);

      jukebox.backgroundVolume = 0.3;
      expect(jukebox.backgroundVolume).toBe(0.3);
    });

    it('starts a sound tagged as a background sound looping, and leaves the track alone', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      AudioStorage.instance.add(makeReadyAudio('bgm-01'));
      AudioStorage.instance.add(makeReadyAudio('rain'));
      AudioTag.create('rain').tag = AUDIO_TAG_BGS;
      jukebox.play('bgm-01');

      jukebox.play('rain');

      expect(BackgroundSound.of('rain')?.isOn).toBe(true);
      expect(jukebox.audioIdentifier).toBe('bgm-01');
      expect(jukebox.isPlaying).toBe(true);
    });

    it('leaves them out of the music the room goes through while its playlist is empty', () => {
      const jukebox = new Jukebox();
      jukebox.initialize();
      AudioStorage.instance.add(makeReadyAudio('bgm-01'));
      AudioStorage.instance.add(makeReadyAudio('rain'));
      AudioStorage.instance.add(makeReadyAudio('door'));
      AudioTag.create('rain').tag = AUDIO_TAG_BGS;
      AudioTag.create('door').tag = 'SE';

      expect(jukebox.queue).toEqual(['bgm-01']);
    });
  });

  describe('syncing between peers', () => {
    it('plays on the first sync when the track was playing', () => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      const playSpy = vi.spyOn(jukebox as unknown as { _play: () => void }, '_play');

      // the initial context is taken
      const context = jukebox.toContext();
      // as though the track and the playing had changed at another peer
      context.syncData = { ...context.syncData, audioIdentifier: 'bgm-sync', isPlaying: true };

      jukebox.apply(context);

      expect(playSpy).toHaveBeenCalledOnce();
    });

    it('plays at once on the first sync when the track is ready', () => {
      const playSpy = stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      // a ready track is added first
      const audio = makeReadyAudio('bgm-ready');
      AudioStorage.instance.add(audio);

      const context = jukebox.toContext();
      context.syncData = { ...context.syncData, audioIdentifier: 'bgm-ready', isPlaying: true };

      jukebox.apply(context);

      // the player is called directly rather than waiting for an event
      expect(playSpy).toHaveBeenCalledOnce();
    });

    it('waits for the update when it is not', () => {
      const playSpy = stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      // a track that is not ready is added
      const audio = makeAudioFile({ identifier: 'bgm-lazy' });
      AudioStorage.instance.add(audio);

      const context = jukebox.toContext();
      context.syncData = { ...context.syncData, audioIdentifier: 'bgm-lazy', isPlaying: true };

      jukebox.apply(context);

      // nothing plays yet
      expect(playSpy).not.toHaveBeenCalled();

      // the track is made ready and the event fired
      const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
      ctx['blob'] = new Blob(['data']);
      ctx['url'] = 'blob:data';
      updateAudioResource$.emit();

      expect(playSpy).toHaveBeenCalledOnce();
    });

    it('plays nothing on the first sync when it was stopped', () => {
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      const playAfterSpy = vi.spyOn(jukebox as unknown as { playAfterFileUpdate: () => void }, 'playAfterFileUpdate');

      const context = jukebox.toContext();
      jukebox.apply(context);

      expect(playAfterSpy).not.toHaveBeenCalled();
    });

    it('plays on a later sync when the track changes and it is playing', () => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      // the first sync is passed over
      const initCtx = jukebox.toContext();
      jukebox.apply(initCtx);

      const playSpy = vi.spyOn(jukebox as unknown as { _play: () => void }, '_play');

      // the track changed at another peer and it is playing
      const ctx2 = jukebox.toContext();
      ctx2.syncData = { ...ctx2.syncData, audioIdentifier: 'new-bgm', isPlaying: true };
      jukebox.apply(ctx2);

      expect(playSpy).toHaveBeenCalledOnce();
    });

    it('stops on a later sync when the playing stops', () => {
      stubAudioPlayerStop();
      const jukebox = new Jukebox();
      jukebox.initialize();

      // the first sync is passed over
      const initCtx = jukebox.toContext();
      jukebox.apply(initCtx);

      // it is set playing first
      jukebox.isPlaying = true;

      const stopSpy = vi.spyOn(jukebox as unknown as { _stop: () => void }, '_stop');

      // and stopped at another peer
      const ctx2 = jukebox.toContext();
      ctx2.syncData = { ...ctx2.syncData, isPlaying: false };
      jukebox.apply(ctx2);

      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('playing through playlists', () => {
    function makePlaylist(identifier: string, entries: string[]): Playlist {
      const playlist = new Playlist(identifier);
      playlist.entries = entries;
      playlist.initialize();
      return playlist;
    }

    function addReady(...identifiers: string[]): void {
      for (const identifier of identifiers) AudioStorage.instance.add(makeReadyAudio(identifier));
    }

    function endTrack(jukebox: Jukebox): void {
      (jukebox as unknown as { onTrackNaturallyEnded(): void }).onTrackNaturallyEnded();
    }

    function makeJukebox(): Jukebox {
      const jukebox = new Jukebox();
      jukebox.initialize();
      return jukebox;
    }

    beforeEach(() => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      vi.spyOn(AudioPlayer.prototype, 'seekTo').mockImplementation(() => {});
    });

    describe('the playlist the room plays through', () => {
      it('is the room’s first while none is chosen', () => {
        const first = makePlaylist(Playlist.DEFAULT_IDENTIFIER, []);

        expect(makeJukebox().playlist).toBe(first);
      });

      it('is the one chosen', () => {
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, []);
        const battle = makePlaylist('battle', []);
        const jukebox = makeJukebox();

        jukebox.playlistIdentifier = 'battle';

        expect(jukebox.playlist).toBe(battle);
      });

      it('is the room’s first again once the chosen one is gone', () => {
        const first = makePlaylist(Playlist.DEFAULT_IDENTIFIER, []);
        const jukebox = makeJukebox();

        jukebox.playlistIdentifier = 'deleted';

        expect(jukebox.playlist).toBe(first);
      });

      it('is the room’s first, unshuffled, for a jukebox an older version sent without either', () => {
        const first = makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a']);
        const jukebox = makeJukebox();
        jukebox.apply(jukebox.toContext());

        const context = jukebox.toContext();
        context.syncData = { audioIdentifier: '', isPlaying: false, repeatMode: 'all', startTime: 0 };
        jukebox.apply(context);

        expect(jukebox.playlist).toBe(first);
        expect(jukebox.shuffles).toBe(false);
        expect(jukebox.playOrder).toEqual(['a']);
      });
    });

    describe('moving on at the end of a track', () => {
      it('follows the chosen playlist rather than the room’s first', () => {
        addReady('a', 'b', 'x', 'y');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b']);
        makePlaylist('battle', ['x', 'y']);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'all';
        jukebox.playlistIdentifier = 'battle';
        jukebox.play('x');

        endTrack(jukebox);

        expect(jukebox.audioIdentifier).toBe('y');
      });

      it('stops after the last track without repeat', () => {
        addReady('a', 'b');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b']);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'none';
        jukebox.play('b');

        endTrack(jukebox);

        expect(jukebox.isPlaying).toBe(false);
        expect(jukebox.audioIdentifier).toBe('');
      });

      it('goes round to the first track on repeat', () => {
        addReady('a', 'b');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b']);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'all';
        jukebox.play('b');

        endTrack(jukebox);

        expect(jukebox.audioIdentifier).toBe('a');
        expect(jukebox.isPlaying).toBe(true);
      });

      it('follows the shuffled order while shuffled', () => {
        const tracks = ['a', 'b', 'c', 'd', 'e', 'f'];
        addReady(...tracks);
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, tracks);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'all';
        jukebox.play('a');
        jukebox.setShuffled(true);
        const order = jukebox.playOrder;

        endTrack(jukebox);

        expect(order[0]).toBe('a');
        expect(jukebox.audioIdentifier).toBe(order[1]);
      });

      it('plays every track once before the shuffled order goes round', () => {
        const tracks = ['a', 'b', 'c', 'd', 'e', 'f'];
        addReady(...tracks);
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, tracks);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'none';
        jukebox.play('c');
        jukebox.setShuffled(true);

        const heard = [jukebox.audioIdentifier];
        for (let i = 0; i < tracks.length; i++) {
          endTrack(jukebox);
          if (jukebox.audioIdentifier) heard.push(jukebox.audioIdentifier);
        }

        expect([...heard].sort()).toEqual(tracks);
        expect(jukebox.isPlaying).toBe(false);
      });

      it('mixes the next time round afresh, without the track just heard coming first', () => {
        const tracks = ['a', 'b', 'c', 'd', 'e', 'f'];
        addReady(...tracks);
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, tracks);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'all';
        jukebox.play('a');
        jukebox.setShuffled(true);
        const firstRound = jukebox.playOrder;
        const seed = jukebox.shuffleSeed;
        jukebox.play(firstRound[firstRound.length - 1]);

        endTrack(jukebox);

        expect(jukebox.shuffleSeed).not.toBe(seed);
        expect(jukebox.audioIdentifier).not.toBe(firstRound[firstRound.length - 1]);
        expect(jukebox.playOrder[0]).toBe(jukebox.audioIdentifier);
      });

      it('comes to the same next track and mix on every peer that hears the same track end', () => {
        const tracks = ['a', 'b', 'c', 'd', 'e', 'f'];
        addReady(...tracks);
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, tracks);
        const here = makeJukebox();
        here.repeatMode = 'all';
        here.play('a');
        here.setShuffled(true);
        here.play(here.playOrder[tracks.length - 1]);
        const there = new Jukebox(here.identifier);
        there.apply(here.toContext());

        endTrack(here);
        endTrack(there);

        expect(there.audioIdentifier).toBe(here.audioIdentifier);
        expect(there.shuffleSeed).toBe(here.shuffleSeed);
        expect(there.playOrder).toEqual(here.playOrder);
      });
    });

    describe('pausing', () => {
      it('keeps the track and where it was', () => {
        addReady('a');
        const jukebox = makeJukebox();
        jukebox.play('a');
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(42);

        jukebox.pause();

        expect(jukebox.isPlaying).toBe(false);
        expect(jukebox.isPaused).toBe(true);
        expect(jukebox.audioIdentifier).toBe('a');
        expect(jukebox.startTime).toBe(42);
        expect(jukebox.position).toBe(42);
      });

      it('goes on from where it was', () => {
        addReady('a');
        const jukebox = makeJukebox();
        jukebox.play('a');
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(42);
        jukebox.pause();
        const seekSpy = vi.mocked(AudioPlayer.prototype.seekTo);

        jukebox.resume();

        expect(jukebox.isPlaying).toBe(true);
        expect(seekSpy).toHaveBeenLastCalledWith(42);
      });

      it('starts the next track from the top, wherever the last one was left', () => {
        addReady('a', 'b');
        const jukebox = makeJukebox();
        jukebox.play('a');
        jukebox.seek(80);

        jukebox.play('b');

        expect(jukebox.startTime).toBe(0);
      });

      it('goes on from the same point at another peer', () => {
        addReady('a');
        const jukebox = makeJukebox();
        jukebox.apply(jukebox.toContext());
        const paused = jukebox.toContext();
        paused.syncData = { ...paused.syncData, audioIdentifier: 'a', isPlaying: false, startTime: 42 };
        jukebox.apply(paused);
        const seekSpy = vi.mocked(AudioPlayer.prototype.seekTo);
        seekSpy.mockClear();

        const resumed = jukebox.toContext();
        resumed.syncData = { ...resumed.syncData, isPlaying: true };
        jukebox.apply(resumed);

        expect(seekSpy).toHaveBeenCalledWith(42);
      });

      it('starts a track another peer changed to from the top, whatever the last position', () => {
        addReady('a', 'b');
        const jukebox = makeJukebox();
        jukebox.apply(jukebox.toContext());
        const paused = jukebox.toContext();
        paused.syncData = { ...paused.syncData, audioIdentifier: 'a', isPlaying: false, startTime: 42 };
        jukebox.apply(paused);
        const seekSpy = vi.mocked(AudioPlayer.prototype.seekTo);
        seekSpy.mockClear();

        const changed = jukebox.toContext();
        changed.syncData = { ...changed.syncData, audioIdentifier: 'b', isPlaying: true };
        jukebox.apply(changed);

        expect(seekSpy).not.toHaveBeenCalled();
      });

      it('does nothing while nothing plays', () => {
        const jukebox = makeJukebox();

        jukebox.pause();

        expect(jukebox.isPaused).toBe(false);
      });
    });

    describe('skipping', () => {
      it('plays the next track this peer can play, passing one it cannot', () => {
        addReady('a', 'c');
        AudioStorage.instance.add(makeAudioFile({ identifier: 'b' }));
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b', 'c']);
        const jukebox = makeJukebox();
        jukebox.play('a');

        jukebox.playNext();

        expect(jukebox.audioIdentifier).toBe('c');
      });

      it('goes round from the last track whatever the repeat', () => {
        addReady('a', 'b');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b']);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'none';
        jukebox.play('b');

        jukebox.playNext();

        expect(jukebox.audioIdentifier).toBe('a');
      });

      it('starts with the first track when nothing is held', () => {
        addReady('a', 'b');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b']);
        const jukebox = makeJukebox();

        jukebox.playNext();

        expect(jukebox.audioIdentifier).toBe('a');
      });

      it('starts the track again when it is a few seconds in', () => {
        addReady('a', 'b');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b']);
        const jukebox = makeJukebox();
        jukebox.play('b');
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(10);

        jukebox.playPrevious();

        expect(jukebox.audioIdentifier).toBe('b');
        expect(AudioPlayer.prototype.seekTo).toHaveBeenLastCalledWith(0);
      });

      it('starts the track again from the top at the other peers too, though it began there', () => {
        addReady('a');
        const jukebox = makeJukebox();
        jukebox.apply(jukebox.toContext());
        const playing = jukebox.toContext();
        playing.syncData = { ...playing.syncData, audioIdentifier: 'a', isPlaying: true, startTime: 0 };
        jukebox.apply(playing);
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(10);
        const seekSpy = vi.mocked(AudioPlayer.prototype.seekTo);
        seekSpy.mockClear();

        const restarted = jukebox.toContext();
        restarted.syncData = { ...restarted.syncData, startTime: 0, seekCount: (jukebox.seekCount ?? 0) + 1 };
        jukebox.apply(restarted);

        expect(seekSpy).toHaveBeenCalledWith(0);
      });

      it('fades in a player that follows loop points as well when another peer moves the track', () => {
        addReady('a');
        const jukebox = makeJukebox();
        jukebox.apply(jukebox.toContext());
        const playing = jukebox.toContext();
        playing.syncData = { ...playing.syncData, audioIdentifier: 'a', isPlaying: true, startTime: 0 };
        jukebox.apply(playing);
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(10);
        const play = vi.mocked(AudioPlayer.prototype.play);
        play.mockClear();

        const moved = jukebox.toContext();
        moved.syncData = { ...moved.syncData, startTime: 30, seekCount: (jukebox.seekCount ?? 0) + 1 };
        jukebox.apply(moved);

        const after = (jukebox as unknown as { audioPlayer: AudioPlayer }).audioPlayer;
        expect(play.mock.contexts).toEqual([after]);
        expect(after.followsLoopPoints).toBe(true);
      });

      it('takes no seek from an older version that sends no count', () => {
        addReady('a');
        const jukebox = makeJukebox();
        jukebox.apply(jukebox.toContext());
        const playing = jukebox.toContext();
        playing.syncData = { ...playing.syncData, audioIdentifier: 'a', isPlaying: true, startTime: 0, seekCount: 3 };
        jukebox.apply(playing);
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(10);
        const seekSpy = vi.mocked(AudioPlayer.prototype.seekTo);
        seekSpy.mockClear();

        const older = jukebox.toContext();
        const { seekCount: _dropped, ...withoutCount } = older.syncData as Record<string, unknown>;
        older.syncData = withoutCount;
        jukebox.apply(older);

        expect(seekSpy).not.toHaveBeenCalled();
      });

      it('plays the track before near the start', () => {
        addReady('a', 'b');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a', 'b']);
        const jukebox = makeJukebox();
        jukebox.play('b');
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(1);

        jukebox.playPrevious();

        expect(jukebox.audioIdentifier).toBe('a');
      });
    });

    describe('starting a playlist', () => {
      it('chooses it and plays its first track', () => {
        addReady('a', 'x', 'y');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a']);
        const battle = makePlaylist('battle', ['x', 'y']);
        const jukebox = makeJukebox();
        jukebox.play('a');

        jukebox.playPlaylist(battle);

        expect(jukebox.playlistIdentifier).toBe('battle');
        expect(jukebox.audioIdentifier).toBe('x');
      });

      it('only chooses an empty one, and the music goes on', () => {
        addReady('a');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a']);
        const empty = makePlaylist('empty', []);
        const jukebox = makeJukebox();
        jukebox.play('a');

        jukebox.playPlaylist(empty);

        expect(jukebox.playlistIdentifier).toBe('empty');
        expect(jukebox.audioIdentifier).toBe('a');
        expect(jukebox.isPlaying).toBe(true);
      });

      it('plays a track picked from a playlist and goes on through that playlist', () => {
        addReady('a', 'x', 'y');
        makePlaylist(Playlist.DEFAULT_IDENTIFIER, ['a']);
        const battle = makePlaylist('battle', ['x', 'y']);
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'all';

        jukebox.playFromPlaylist(battle, 'x');
        endTrack(jukebox);

        expect(jukebox.audioIdentifier).toBe('y');
      });
    });
  });
  describe('mixing', () => {
    const reading: AudioAnalysis = {
      version: AUDIO_ANALYSIS_VERSION,
      duration: 100,
      lufs: -10,
      peak: -0.5,
      start: 0,
      end: 100,
      bpm: null,
      bar: null,
      confidence: 0,
    };

    function roomMixing(settings: Partial<DjSettings> = {}): void {
      let config = ObjectStore.instance.get<Config>('Config');
      if (!config) {
        config = new Config('Config');
        config.initialize();
      }
      config.djSettings = { ...DEFAULT_DJ_SETTINGS, ...settings };
    }

    function playerOf(jukebox: Jukebox): AudioPlayer {
      return (jukebox as unknown as { audioPlayer: AudioPlayer }).audioPlayer;
    }

    /** Players never sound here, as the browser's are mocked; this makes each one sound from its play to its stop. */
    function playersSound(): void {
      const sounding = new WeakSet<AudioPlayer>();
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(function (this: AudioPlayer) {
        sounding.add(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(function (this: AudioPlayer) {
        sounding.delete(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'paused', 'get').mockImplementation(function (this: AudioPlayer) {
        return !sounding.has(this);
      });
    }

    function makeJukebox(): Jukebox {
      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      return jukebox;
    }

    beforeEach(() => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      vi.spyOn(AudioPlayer.prototype, 'seekTo').mockImplementation(() => {});
      for (const identifier of ['a', 'b', 'c']) AudioStorage.instance.add(makeReadyAudio(identifier));
    });

    it('brings a track to the loudness of music while the room levels its sounds', () => {
      roomMixing();
      AudioProfile.share('a', reading);
      const jukebox = makeJukebox();

      jukebox.play('a');

      expect(playerOf(jukebox).trim).toBeCloseTo(Math.pow(10, -6 / 20), 6);
    });

    it('plays a track as it is when the room does not level, or before it has been read', () => {
      roomMixing({ autoLevel: false });
      AudioProfile.share('a', reading);
      const jukebox = makeJukebox();

      jukebox.play('a');
      expect(playerOf(jukebox).trim).toBe(1);

      roomMixing();
      jukebox.play('b');
      expect(playerOf(jukebox).trim).toBe(1);
    });

    it('plays an effect at the loudness of effects', () => {
      roomMixing();
      const seSpy = vi.spyOn(AudioPlayer, 'playSE').mockImplementation(() => {});
      const se = makeReadyAudio('se-loud');
      AudioStorage.instance.add(se);
      AudioTag.create('se-loud').tag = 'SE';
      AudioProfile.share('se-loud', { ...reading, lufs: -4 });
      const jukebox = makeJukebox();

      jukebox.play('se-loud');

      expect(seSpy).toHaveBeenCalledWith(se, expect.closeTo(Math.pow(10, -12 / 20), 6));
    });

    it('eases a track already playing to its level once its reading arrives', () => {
      roomMixing();
      const jukebox = makeJukebox();
      jukebox.play('a');
      const glide = vi.spyOn(playerOf(jukebox), 'glideTrim');

      AudioProfile.share('a', reading);
      jukebox.refreshMix();

      expect(glide).toHaveBeenCalledWith(expect.closeTo(Math.pow(10, -6 / 20), 6), Jukebox.LEVEL_GLIDE_S);
    });

    it('fades the track before into the next over the room crossfade', () => {
      roomMixing({ crossfadeS: 4 });
      playersSound();
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.play('a');
      const before = playerOf(jukebox);

      jukebox.play('b');

      const after = playerOf(jukebox);
      expect(after).not.toBe(before);
      expect(fade.mock.contexts).toEqual([before, after]);
      expect(fade.mock.calls).toEqual([
        [0, 4000],
        [1, 4000],
      ]);
      expect(after.fader).toBe(0);
    });

    it('plays later tracks on players let go before, rather than making one for each', async () => {
      roomMixing({ crossfadeS: 4 });
      playersSound();
      vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.play('a');
      const first = playerOf(jukebox);
      jukebox.play('b');
      await Promise.resolve();
      await Promise.resolve();

      jukebox.play('c');

      expect(playerOf(jukebox)).toBe(first);
      expect(first.paused).toBe(false);
    });

    it('leaves a player playing again alone when the fade it was let go with ends late', async () => {
      roomMixing({ crossfadeS: 4, pauseFadeS: 0 });
      playersSound();
      let finishFirstFade: (() => void) | null = null;
      vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockImplementation((target) => {
        if (target !== 0 || finishFirstFade) return Promise.resolve();
        return new Promise<void>((resolve) => (finishFirstFade = resolve));
      });
      const jukebox = makeJukebox();
      jukebox.play('a');
      const first = playerOf(jukebox);
      jukebox.play('b');
      jukebox.stop();
      jukebox.play('a');
      jukebox.play('c');
      expect(playerOf(jukebox)).toBe(first);

      finishFirstFade!();
      await Promise.resolve();
      await Promise.resolve();

      expect(first.paused).toBe(false);
    });

    it('cuts across from a track still being read, which has nothing yet to fade out', () => {
      roomMixing({ crossfadeS: 4 });
      playersSound();
      vi.spyOn(AudioPlayer.prototype, 'isLoading', 'get').mockReturnValue(true);
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.play('b');

      expect(fade).not.toHaveBeenCalled();
      expect(playerOf(jukebox).fader).toBe(1);
    });

    it('cuts straight across without a crossfade, or when nothing was sounding', () => {
      roomMixing({ crossfadeS: 0 });
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const stop = vi.mocked(AudioPlayer.prototype.stop);
      const jukebox = makeJukebox();
      jukebox.play('a');
      const before = playerOf(jukebox);
      stop.mockClear();

      jukebox.play('b');

      expect(fade).not.toHaveBeenCalled();
      expect(stop.mock.contexts).toContain(before);
    });

    it('fades the track out when the room pauses or stops it', () => {
      roomMixing();
      playersSound();
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.pause();
      expect(fade).toHaveBeenLastCalledWith(0, DEFAULT_DJ_SETTINGS.pauseFadeS * 1000);

      jukebox.resume();
      jukebox.stop();
      expect(fade).toHaveBeenLastCalledWith(0, DEFAULT_DJ_SETTINGS.pauseFadeS * 1000);
    });

    it('fades out over the room fade for a pause, and back in when the track goes on', () => {
      roomMixing({ pauseFadeS: 4 });
      playersSound();
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.pause();
      expect(fade).toHaveBeenLastCalledWith(0, 4000);

      jukebox.resume();
      expect(fade).toHaveBeenLastCalledWith(1, 4000);
      expect(playerOf(jukebox).fader).toBe(0);
    });

    it('fades back in when another peer goes on with the track', () => {
      roomMixing({ pauseFadeS: 2 });
      playersSound();
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.apply(jukebox.toContext());
      const paused = jukebox.toContext();
      paused.syncData = { ...paused.syncData, audioIdentifier: 'a', isPlaying: false, startTime: 12 };
      jukebox.apply(paused);

      const resumed = jukebox.toContext();
      resumed.syncData = { ...resumed.syncData, isPlaying: true };
      jukebox.apply(resumed);

      expect(fade).toHaveBeenLastCalledWith(1, 2000);
    });

    it('cuts a pause at once, and goes on at once, without a fade for a pause', () => {
      roomMixing({ pauseFadeS: 0 });
      playersSound();
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.pause();
      jukebox.resume();

      expect(fade).not.toHaveBeenCalled();
    });

    it('starts past the silence at the head of a track while tracks are mixed into each other', () => {
      roomMixing({ crossfadeS: 2 });
      AudioProfile.share('a', { ...reading, start: 1.2 });
      const seek = vi.mocked(AudioPlayer.prototype.seekTo);
      const jukebox = makeJukebox();

      jukebox.play('a');

      expect(seek).toHaveBeenCalledWith(expect.closeTo(1.15, 6));
    });

    it('keeps the silence at the head of a track without a crossfade, and a short one always', () => {
      AudioProfile.share('a', { ...reading, start: 1.2 });
      AudioProfile.share('b', { ...reading, start: 0.2 });
      const seek = vi.mocked(AudioPlayer.prototype.seekTo);
      const jukebox = makeJukebox();

      roomMixing({ crossfadeS: 0 });
      jukebox.play('a');
      roomMixing({ crossfadeS: 2 });
      jukebox.play('b');

      expect(seek).not.toHaveBeenCalled();
    });

    describe('moving on before a track ends', () => {
      function playingAt(currentTime: number, duration = 100): void {
        vi.spyOn(AudioPlayer.prototype, 'paused', 'get').mockReturnValue(false);
        vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(currentTime);
        vi.spyOn(AudioPlayer.prototype, 'duration', 'get').mockReturnValue(duration);
      }

      beforeEach(() => {
        const playlist = new Playlist(Playlist.DEFAULT_IDENTIFIER);
        playlist.entries = ['a', 'b', 'c'];
        playlist.initialize();
      });

      it('moves on as the crossfade before the end begins', () => {
        roomMixing({ crossfadeS: 2 });
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'all';
        jukebox.play('a');

        playingAt(97);
        jukebox.tickAutomix();
        expect(jukebox.audioIdentifier).toBe('a');

        playingAt(98.1);
        jukebox.tickAutomix();
        expect(jukebox.audioIdentifier).toBe('b');
      });

      it('moves on at the last sound rather than at the end of the file', () => {
        roomMixing({ crossfadeS: 2 });
        AudioProfile.share('a', { ...reading, end: 90 });
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'all';
        jukebox.play('a');

        playingAt(88.5);
        jukebox.tickAutomix();

        expect(jukebox.audioIdentifier).toBe('b');
      });

      it('lets the last track play to its end when the room does not go round', () => {
        roomMixing({ crossfadeS: 2 });
        const jukebox = makeJukebox();
        jukebox.repeatMode = 'none';
        jukebox.play('c');

        playingAt(99);
        jukebox.tickAutomix();

        expect(jukebox.audioIdentifier).toBe('c');
        expect(jukebox.isPlaying).toBe(true);
      });

      it('stays on repeat one, without a crossfade, and while the length is not known', () => {
        const jukebox = makeJukebox();
        jukebox.play('a');

        roomMixing({ crossfadeS: 2 });
        jukebox.repeatMode = 'one';
        playingAt(99.5);
        jukebox.tickAutomix();

        roomMixing({ crossfadeS: 0 });
        jukebox.repeatMode = 'all';
        jukebox.tickAutomix();

        roomMixing({ crossfadeS: 2 });
        playingAt(99.5, NaN);
        jukebox.tickAutomix();

        expect(jukebox.audioIdentifier).toBe('a');
      });
    });
  });

  describe('effects and braking', () => {
    function makeJukebox(): Jukebox {
      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      return jukebox;
    }

    function soundingPlayers(): void {
      const sounding = new WeakSet<AudioPlayer>();
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(function (this: AudioPlayer) {
        sounding.add(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(function (this: AudioPlayer) {
        sounding.delete(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'paused', 'get').mockImplementation(function (this: AudioPlayer) {
        return !sounding.has(this);
      });
    }

    beforeEach(() => {
      vi.spyOn(AudioPlayer.prototype, 'seekTo').mockImplementation(() => {});
      AudioStorage.instance.add(makeReadyAudio('a'));
    });

    it('puts the music through the effects for everyone, the echo timed to the track beat', () => {
      stubAudioPlayerPlay();
      stubAudioPlayerStop();
      const setEffects = vi.spyOn(MusicBus, 'setEffects').mockImplementation(() => {});
      AudioProfile.setGrid('a', { bpm: 100, bar: 0 });
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.setEffects({ filter: -0.5, echo: 0.3, reverb: 0 });

      expect(JSON.parse(jukebox.fx ?? '')).toEqual({ filter: -0.5, echo: 0.3 });
      expect(setEffects).toHaveBeenLastCalledWith(
        { filter: -0.5, echo: 0.3, reverb: 0, echoDelayS: expect.closeTo(0.45, 9) },
        0.05
      );
    });

    it('follows effects another peer sets, and those the room had when this peer joined', () => {
      const setEffects = vi.spyOn(MusicBus, 'setEffects').mockImplementation(() => {});
      const jukebox = makeJukebox();
      const joined = jukebox.toContext();
      joined.syncData = { ...joined.syncData, fx: '{"reverb":0.6}' };
      jukebox.apply(joined);
      expect(setEffects).toHaveBeenLastCalledWith(expect.objectContaining({ reverb: 0.6 }), 0.05);

      const changed = jukebox.toContext();
      changed.syncData = { ...changed.syncData, fx: '{"filter":0.8}' };
      jukebox.apply(changed);
      expect(setEffects).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 0.8, reverb: 0 }), 0.05);
    });

    it('puts the music through the room effects on joining while the track itself is still on its way', () => {
      const setEffects = vi.spyOn(MusicBus, 'setEffects').mockImplementation(() => {});
      const jukebox = makeJukebox();
      const joined = jukebox.toContext();
      joined.syncData = { ...joined.syncData, audioIdentifier: 'not-here-yet', isPlaying: true, fx: '{"echo":0.4}' };

      jukebox.apply(joined);

      expect(setEffects).toHaveBeenLastCalledWith(expect.objectContaining({ echo: 0.4 }), 0.05);
    });

    it('brakes the track to a stop, keeping where the braking began to go on from', () => {
      soundingPlayers();
      const brake = vi.spyOn(AudioPlayer.prototype, 'brake').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.play('a');
      const playing = (jukebox as unknown as { audioPlayer: AudioPlayer }).audioPlayer;
      vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(33);

      jukebox.brakeStop();

      expect(jukebox.isPlaying).toBe(false);
      expect(jukebox.isPaused).toBe(true);
      expect(jukebox.startTime).toBe(33);
      expect(jukebox.brakeCount).toBe(1);
      expect(brake.mock.contexts).toEqual([playing]);
      expect(brake).toHaveBeenCalledWith(Jukebox.BRAKE_MS);
    });

    it('brakes at the other peers too, and fades out an ordinary stop or one from an older version', () => {
      soundingPlayers();
      const brake = vi.spyOn(AudioPlayer.prototype, 'brake').mockResolvedValue();
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const jukebox = makeJukebox();
      jukebox.apply(jukebox.toContext());
      const start = jukebox.toContext();
      start.syncData = { ...start.syncData, audioIdentifier: 'a', isPlaying: true };
      jukebox.apply(start);

      const braked = jukebox.toContext();
      braked.syncData = { ...braked.syncData, isPlaying: false, brakeCount: 1 };
      jukebox.apply(braked);
      expect(brake).toHaveBeenCalledOnce();

      const again = jukebox.toContext();
      again.syncData = { ...again.syncData, isPlaying: true };
      jukebox.apply(again);
      const older = jukebox.toContext();
      const { brakeCount: _dropped, ...withoutCount } = older.syncData as Record<string, unknown>;
      older.syncData = { ...withoutCount, isPlaying: false };
      jukebox.apply(older);

      expect(brake).toHaveBeenCalledOnce();
      expect(fade).toHaveBeenLastCalledWith(0, DEFAULT_DJ_SETTINGS.pauseFadeS * 1000);
    });
  });

  describe('quantising and jumping to marked places', () => {
    let sounding: WeakSet<AudioPlayer>;
    let played: string[];

    function makeJukebox(): Jukebox {
      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      return jukebox;
    }

    function roomQuantises(quantize = true): void {
      let config = ObjectStore.instance.get<Config>('Config');
      if (!config) {
        config = new Config('Config');
        config.initialize();
      }
      config.djSettings = { ...DEFAULT_DJ_SETTINGS, crossfadeS: 0, quantize };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      sounding = new WeakSet<AudioPlayer>();
      played = [];
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(function (this: AudioPlayer, audio?: AudioFile) {
        sounding.add(this);
        played.push(audio?.identifier ?? '');
      });
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(function (this: AudioPlayer) {
        sounding.delete(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'paused', 'get').mockImplementation(function (this: AudioPlayer) {
        return !sounding.has(this);
      });
      vi.spyOn(AudioPlayer.prototype, 'currentTime', 'get').mockReturnValue(1.25);
      vi.spyOn(AudioPlayer.prototype, 'seekTo').mockImplementation(() => {});
      for (const identifier of ['a', 'b']) AudioStorage.instance.add(makeReadyAudio(identifier));
      AudioProfile.setGrid('a', { bpm: 120, bar: 0 });
    });

    afterEach(() => vi.useRealTimers());

    it('changes track on the next bar of the track sounding while the room quantises', () => {
      roomQuantises();
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.play('b');
      expect(jukebox.audioIdentifier).toBe('b');
      expect(jukebox.quantizeCount).toBe(1);
      vi.advanceTimersByTime(749);
      expect(played).toEqual(['a']);

      vi.advanceTimersByTime(1);
      expect(played).toEqual(['a', 'b']);
    });

    it('changes track at once without quantising, or when the track sounding keeps no beats', () => {
      roomQuantises(false);
      const jukebox = makeJukebox();
      jukebox.play('a');
      jukebox.play('b');
      expect(played).toEqual(['a', 'b']);

      roomQuantises();
      jukebox.play('a');
      expect(played).toEqual(['a', 'b', 'a']);
      expect(jukebox.quantizeCount ?? 0).toBe(0);
    });

    function joinPlaying(jukebox: Jukebox, identifier: string): void {
      jukebox.apply(jukebox.toContext());
      const playing = jukebox.toContext();
      playing.syncData = { ...playing.syncData, audioIdentifier: identifier, isPlaying: true };
      jukebox.apply(playing);
    }

    function hear(jukebox: Jukebox, change: Record<string, unknown>): void {
      const context = jukebox.toContext();
      context.syncData = { ...context.syncData, ...change };
      jukebox.apply(context);
    }

    it('follows at once a change another peer made at once, and waits for its own bar for one that peer waited for', () => {
      roomQuantises();
      AudioProfile.setGrid('b', { bpm: 120, bar: 0 });
      const jukebox = makeJukebox();
      joinPlaying(jukebox, 'a');

      hear(jukebox, { audioIdentifier: 'b' });
      expect(played).toEqual(['a', 'b']);

      hear(jukebox, { audioIdentifier: 'a', quantizeCount: 1 });
      expect(played).toEqual(['a', 'b']);
      vi.advanceTimersByTime(750);
      expect(played).toEqual(['a', 'b', 'a']);
    });

    it('brings a change waiting for its bar in at once, to the track chosen, when the track sounding ends first', () => {
      roomQuantises();
      AudioStorage.instance.add(makeReadyAudio('c'));
      const playlist = new Playlist(Playlist.DEFAULT_IDENTIFIER);
      playlist.entries = ['a', 'b', 'c'];
      playlist.initialize();
      const jukebox = makeJukebox();
      jukebox.repeatMode = 'all';
      jukebox.play('a');
      const ending = (jukebox as unknown as { audioPlayer: AudioPlayer }).audioPlayer;
      jukebox.play('b');

      ending.onEnded!();

      expect(played).toEqual(['a', 'b']);
      expect(jukebox.audioIdentifier).toBe('b');
      vi.advanceTimersByTime(2000);
      expect(played).toEqual(['a', 'b']);
    });

    it('starts a change waiting for its bar from where the track was moved meanwhile, leaving the one sounding be', () => {
      roomQuantises();
      const seek = vi.mocked(AudioPlayer.prototype.seekTo);
      const jukebox = makeJukebox();
      jukebox.play('a');
      jukebox.play('b');
      seek.mockClear();

      jukebox.seek(20);
      expect(seek).not.toHaveBeenCalled();
      vi.advanceTimersByTime(750);

      expect(played).toEqual(['a', 'b']);
      expect(seek).toHaveBeenLastCalledWith(20);
    });

    it('starts a change waiting for its bar where another peer moved the track meanwhile, and only then', () => {
      roomQuantises();
      const seek = vi.mocked(AudioPlayer.prototype.seekTo);
      const jukebox = makeJukebox();
      joinPlaying(jukebox, 'a');
      hear(jukebox, { audioIdentifier: 'b', quantizeCount: 1 });

      hear(jukebox, { startTime: 30, seekCount: 1 });
      expect(played).toEqual(['a']);
      vi.advanceTimersByTime(750);

      expect(played).toEqual(['a', 'b']);
      expect(seek).toHaveBeenLastCalledWith(30);
    });

    it('keeps the track still sounding at its own level while a change waits for its bar', () => {
      roomQuantises();
      const config = ObjectStore.instance.get<Config>('Config')!;
      config.djSettings = { ...config.djSettings, autoLevel: true };
      const reading = {
        version: AUDIO_ANALYSIS_VERSION,
        duration: 100,
        start: 0,
        end: 100,
        peak: -0.5,
        bpm: 120,
        bar: 0,
        confidence: 1,
      };
      AudioProfile.share('a', { ...reading, lufs: -8 });
      AudioProfile.share('b', { ...reading, lufs: -24 });
      const jukebox = makeJukebox();
      jukebox.play('a');
      const sounding = (jukebox as unknown as { audioPlayer: AudioPlayer }).audioPlayer;
      const levelOfA = sounding.trim;
      const glide = vi.spyOn(sounding, 'glideTrim');
      jukebox.play('b');

      jukebox.refreshMix();

      expect(glide).toHaveBeenCalledWith(levelOfA, Jukebox.LEVEL_GLIDE_S);
      expect(levelOfA).not.toBeCloseTo(1, 3);
    });

    it('waits for the next beat instead when a bar is longer than the wait allowed', () => {
      roomQuantises();
      AudioProfile.setGrid('a', { bpm: 40, bar: 0 });
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.play('b');
      vi.advanceTimersByTime(249);
      expect(played).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(played).toEqual(['a', 'b']);
    });

    it('tells no place in the new track while the change waits, and keeps none if paused then', () => {
      roomQuantises();
      const jukebox = makeJukebox();
      jukebox.play('a');
      vi.spyOn(AudioPlayer.prototype, 'duration', 'get').mockReturnValue(100);
      expect(jukebox.position).toBe(1.25);

      jukebox.play('b');
      expect(jukebox.position).toBe(0);
      expect(jukebox.duration).toBe(0);

      jukebox.pause();
      expect(jukebox.startTime).toBe(0);
    });

    it('looks for no point to move on at while a change waits for its bar', () => {
      roomQuantises();
      const config = ObjectStore.instance.get<Config>('Config')!;
      config.djSettings = { ...config.djSettings, crossfadeS: 2 };
      const playlist = new Playlist(Playlist.DEFAULT_IDENTIFIER);
      playlist.entries = ['a', 'b', 'c'];
      playlist.initialize();
      const jukebox = makeJukebox();
      jukebox.repeatMode = 'all';
      jukebox.play('a');
      jukebox.play('b');
      vi.spyOn(AudioPlayer.prototype, 'duration', 'get').mockReturnValue(2.5);

      jukebox.tickAutomix();

      expect(jukebox.audioIdentifier).toBe('b');
    });

    it('forgets a change still waiting when the room pauses', () => {
      roomQuantises();
      const jukebox = makeJukebox();
      jukebox.play('a');
      jukebox.play('b');

      jukebox.pause();
      vi.advanceTimersByTime(2000);

      expect(played).toEqual(['a']);
    });

    it('jumps to a marked place on the next beat with a short crossfade, for every peer', () => {
      roomQuantises();
      const fade = vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const seek = vi.mocked(AudioPlayer.prototype.seekTo);
      const jukebox = makeJukebox();
      jukebox.play('a');

      jukebox.jumpTo(30);
      expect(jukebox.startTime).toBe(30);
      expect(jukebox.jumpCount).toBe(1);
      expect(jukebox.seekCount).toBe(1);
      vi.advanceTimersByTime(249);
      expect(seek).not.toHaveBeenCalledWith(30);

      vi.advanceTimersByTime(1);
      expect(seek).toHaveBeenCalledWith(30);
      expect(fade).toHaveBeenCalledWith(1, Jukebox.JUMP_FADE_MS);
    });

    it('follows a jump from another peer on its own next beat, and a seek from an older version as a seek', () => {
      roomQuantises();
      vi.spyOn(AudioPlayer.prototype, 'fadeVolumeTo').mockResolvedValue();
      const seek = vi.mocked(AudioPlayer.prototype.seekTo);
      const jukebox = makeJukebox();
      jukebox.apply(jukebox.toContext());
      const playing = jukebox.toContext();
      playing.syncData = { ...playing.syncData, audioIdentifier: 'a', isPlaying: true };
      jukebox.apply(playing);

      const jumped = jukebox.toContext();
      jumped.syncData = { ...jumped.syncData, startTime: 40, seekCount: 1, jumpCount: 1 };
      jukebox.apply(jumped);
      expect(seek).not.toHaveBeenCalledWith(40);
      vi.advanceTimersByTime(250);
      expect(seek).toHaveBeenCalledWith(40);

      const older = jukebox.toContext();
      const { jumpCount: _dropped, ...withoutCount } = older.syncData as Record<string, unknown>;
      older.syncData = { ...withoutCount, startTime: 50, seekCount: 2 };
      jukebox.apply(older);
      expect(seek).toHaveBeenCalledWith(50);
    });

    it('keeps a jump made while the track is held, to go on from there', () => {
      const jukebox = makeJukebox();
      jukebox.audioIdentifier = 'a';

      jukebox.jumpTo(12);

      expect(jukebox.startTime).toBe(12);
      expect(jukebox.jumpCount ?? 0).toBe(0);
    });
  });
});
