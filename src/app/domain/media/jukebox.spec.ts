import { TestBed } from '@angular/core/testing';
import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
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
      expect(seSpy).toHaveBeenCalledWith(seAudio);

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
    it('multiplies the room volume into the player volume', () => {
      // The volume setter reaches for an audio context, so it is stubbed.
      const volumeSpy = vi.spyOn(AudioPlayer, 'volume', 'set').mockImplementation(() => {});
      const auditionSpy = vi.spyOn(AudioPlayer, 'auditionVolume', 'set').mockImplementation(() => {});
      const seSpy = vi.spyOn(AudioPlayer, 'seVolume', 'set').mockImplementation(() => {});

      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      const config = new Config('Config');
      config.initialize();
      config.roomVolume = 0.8;

      jukebox.volume = 0.5;
      jukebox.auditionVolume = 0.6;
      jukebox.seVolume = 0.7;

      jukebox.setNewVolume();

      expect(volumeSpy).toHaveBeenCalledWith(expect.closeTo(0.4));
      expect(auditionSpy).toHaveBeenCalledWith(expect.closeTo(0.48));
      expect(seSpy).toHaveBeenCalledWith(expect.closeTo(0.56));
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
});
