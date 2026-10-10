import { TestBed } from '@angular/core/testing';
import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { LoopPlayer } from '@axe/core/storage/loop-player';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BackgroundSound } from '@axe/domain/media/background-sound';

function makeAudio(identifier: string, ready = true): AudioFile {
  const audio = AudioFile.createEmpty(identifier);
  const context = (audio as unknown as { context: Record<string, unknown> }).context;
  context['blob'] = ready ? new Blob(['x']) : null;
  context['url'] = ready ? `blob:${identifier}` : '';
  return audio;
}

function makeReady(audio: AudioFile): void {
  const context = (audio as unknown as { context: Record<string, unknown> }).context;
  context['blob'] = new Blob(['x']);
  context['url'] = `blob:${audio.identifier}`;
}

/** Stands in for the loop player, keeping which players are sounding and whether the browser held one back. */
function fakeLoopPlayers() {
  const active = new WeakSet<LoopPlayer>();
  const refused = new WeakSet<LoopPlayer>();
  const browser = { allowsPlayback: true };
  const start = vi.spyOn(LoopPlayer.prototype, 'start').mockImplementation(function (this: LoopPlayer) {
    active.add(this);
    if (browser.allowsPlayback) refused.delete(this);
    else refused.add(this);
  });
  const stop = vi.spyOn(LoopPlayer.prototype, 'stop').mockImplementation(function (this: LoopPlayer) {
    active.delete(this);
    refused.delete(this);
  });
  const setVolume = vi.spyOn(LoopPlayer.prototype, 'setVolume').mockImplementation(() => {});
  const dispose = vi.spyOn(LoopPlayer.prototype, 'dispose').mockImplementation(function (this: LoopPlayer) {
    active.delete(this);
  });
  vi.spyOn(LoopPlayer.prototype, 'isActive', 'get').mockImplementation(function (this: LoopPlayer) {
    return active.has(this);
  });
  vi.spyOn(LoopPlayer.prototype, 'isAwaitingGesture', 'get').mockImplementation(function (this: LoopPlayer) {
    return refused.has(this);
  });
  return { start, stop, setVolume, dispose, browser };
}

/** An update from another peer, with the fields given laid over what the sound holds. */
function fromAnotherPeer(sound: BackgroundSound, syncData: Record<string, unknown>): ObjectContext {
  const context = sound.toContext();
  return { ...context, majorVersion: context.majorVersion + 1, syncData: { ...context.syncData, ...syncData } };
}

/** A background sound arriving from another peer, as it does for somebody joining the room. */
function arrive(audioIdentifier: string, syncData: Record<string, unknown>): BackgroundSound {
  const sound = new BackgroundSound(BackgroundSound.identifierOf(audioIdentifier));
  const context: ObjectContext = {
    identifier: sound.identifier,
    aliasName: sound.aliasName,
    majorVersion: 1,
    minorVersion: 0,
    syncData: { audioIdentifier, ...syncData },
  };
  ObjectStore.instance.add(sound, false, () => sound.apply(context));
  return sound;
}

describe('BackgroundSound', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    AudioStorage.instance.audios.forEach((audio) => AudioStorage.instance.delete(audio.identifier));
    vi.restoreAllMocks();
  });

  describe('start()', () => {
    it('makes the sound for that file under a name taken from it, and starts it fading in', () => {
      const players = fakeLoopPlayers();
      const audio = makeAudio('rain');
      AudioStorage.instance.add(audio);

      const sound = BackgroundSound.start('rain')!;

      expect(sound.identifier).toBe('bgs_rain');
      expect(sound.isPlaying).toBe(true);
      expect(players.start).toHaveBeenCalledWith(audio, 1, BackgroundSound.FADE_MS);
    });

    it('sends a new one to the room once, already playing', () => {
      fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const sent = vi.spyOn(ObjectStore.instance, 'update');

      BackgroundSound.start('rain');

      const contexts = sent.mock.calls
        .map(([arg]) => arg)
        .filter((arg): arg is ObjectContext => typeof arg !== 'string' && arg.identifier === 'bgs_rain');
      expect(contexts).toHaveLength(1);
      expect(contexts[0].syncData).toMatchObject({ audioIdentifier: 'rain', isPlaying: true });
    });

    it('starts the same one again rather than making a second, keeping the room volume', () => {
      fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const first = BackgroundSound.start('rain')!;
      first.setVolume(0.4);
      first.stop();

      const again = BackgroundSound.start('rain');

      expect(again).toBe(first);
      expect(again!.level).toBe(0.4);
      expect(ObjectStore.instance.getObjects(BackgroundSound)).toHaveLength(1);
    });

    it('leaves a sound already playing going, not starting it over', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      BackgroundSound.start('rain');

      BackgroundSound.start('rain');

      expect(players.start).toHaveBeenCalledOnce();
    });

    it('does nothing without a sound', () => {
      expect(BackgroundSound.start('')).toBeNull();
    });
  });

  describe('stop()', () => {
    it('lets the sound die away and keeps it in the room, marked stopped', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const sound = BackgroundSound.start('rain')!;

      sound.stop();

      expect(sound.isPlaying).toBe(false);
      expect(players.stop).toHaveBeenCalledWith(BackgroundSound.FADE_MS);
      expect(BackgroundSound.of('rain')).toBe(sound);
    });
  });

  describe('the volume', () => {
    it('is shared and heard at once', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const sound = BackgroundSound.start('rain')!;

      sound.setVolume(0.3);

      expect(sound.volume).toBe(0.3);
      expect(players.setVolume).toHaveBeenLastCalledWith(0.3);
    });

    it('is kept between 0 and 1', () => {
      fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const sound = BackgroundSound.start('rain')!;

      sound.setVolume(3);
      expect(sound.volume).toBe(1);
      sound.setVolume(-1);
      expect(sound.volume).toBe(0);
    });

    it('is heard while being previewed without being shared', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const sound = BackgroundSound.start('rain')!;

      sound.previewVolume(0.2);

      expect(players.setVolume).toHaveBeenLastCalledWith(0.2);
      expect(sound.volume).toBe(1);
    });
  });

  describe('following another peer', () => {
    it('starts, follows the volume and stops as the room does', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const sound = arrive('rain', { isPlaying: false });
      expect(players.start).not.toHaveBeenCalled();

      sound.apply(fromAnotherPeer(sound, { isPlaying: true, volume: 0.6 }));
      expect(players.start).toHaveBeenCalledWith(sound.audio, 0.6, BackgroundSound.FADE_MS);

      sound.apply(fromAnotherPeer(sound, { volume: 0.2 }));
      expect(players.setVolume).toHaveBeenLastCalledWith(0.2);

      sound.apply(fromAnotherPeer(sound, { isPlaying: false }));
      expect(players.stop).toHaveBeenCalledWith(BackgroundSound.FADE_MS);
    });

    it('starts a sound already playing for somebody joining the room', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));

      arrive('rain', { isPlaying: true, volume: 0.5 });

      expect(players.start).toHaveBeenCalledOnce();
    });

    it('waits for the file to arrive before starting', () => {
      const players = fakeLoopPlayers();
      const audio = makeAudio('rain', false);
      AudioStorage.instance.add(audio);

      arrive('rain', { isPlaying: true });
      expect(players.start).not.toHaveBeenCalled();

      makeReady(audio);
      updateAudioResource$.emit();
      expect(players.start).toHaveBeenCalledOnce();
    });

    it('lets the sound go at once when it leaves the room', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      const sound = arrive('rain', { isPlaying: true });

      ObjectStore.instance.remove(sound);

      expect(players.dispose).toHaveBeenCalledOnce();
    });
  });

  describe('starting on a gesture', () => {
    it('starts again on a gesture when the browser held it back', () => {
      const players = fakeLoopPlayers();
      players.browser.allowsPlayback = false;
      AudioStorage.instance.add(makeAudio('rain'));
      arrive('rain', { isPlaying: true });
      expect(players.start).toHaveBeenCalledOnce();

      players.browser.allowsPlayback = true;
      document.body.dispatchEvent(new MouseEvent('mousedown'));

      expect(players.start).toHaveBeenCalledTimes(2);
    });

    it('leaves a sound already sounding alone on a gesture', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      arrive('rain', { isPlaying: true });

      document.body.dispatchEvent(new MouseEvent('mousedown'));

      expect(players.start).toHaveBeenCalledOnce();
    });
  });

  describe('a sound sent by a version that knows less, or with fields missing', () => {
    it('reads a missing or empty volume as full, not as silence', () => {
      fakeLoopPlayers();
      const sound = arrive('rain', {});
      expect(sound.level).toBe(1);

      sound.apply(fromAnotherPeer(sound, { volume: '' }));
      expect(sound.level).toBe(1);

      sound.apply(fromAnotherPeer(sound, { volume: 'loud' }));
      expect(sound.level).toBe(1);

      sound.apply(fromAnotherPeer(sound, { volume: '0.3' }));
      expect(sound.level).toBe(0.3);

      sound.apply(fromAnotherPeer(sound, { volume: 0 }));
      expect(sound.level).toBe(0);
    });

    it('stays stopped unless it is said to be playing in so many words', () => {
      const players = fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));

      const sound = arrive('rain', { isPlaying: 'true' });

      expect(sound.isOn).toBe(false);
      expect(players.start).not.toHaveBeenCalled();
    });

    it('plays nothing without a sound named', () => {
      const players = fakeLoopPlayers();
      const sound = arrive('', { isPlaying: true });

      expect(sound.isOn).toBe(false);
      expect(players.start).not.toHaveBeenCalled();
    });
  });

  describe('playing() and stopAll()', () => {
    it('lists what is playing in the order it was started, and stops it all', () => {
      fakeLoopPlayers();
      AudioStorage.instance.add(makeAudio('rain'));
      AudioStorage.instance.add(makeAudio('fire'));
      AudioStorage.instance.add(makeAudio('crowd'));
      arrive('fire', { isPlaying: true, startedAt: 200 });
      arrive('rain', { isPlaying: true, startedAt: 100 });
      arrive('crowd', { isPlaying: false, startedAt: 50 });

      expect(BackgroundSound.playing().map((sound) => sound.audioIdentifier)).toEqual(['rain', 'fire']);

      BackgroundSound.stopAll();
      expect(BackgroundSound.playing()).toEqual([]);
    });
  });
});
