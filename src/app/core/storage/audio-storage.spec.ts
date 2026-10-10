import { Network } from '@axe/core/network/network';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';

describe('AudioStorage', () => {
  let storage: AudioStorage;

  beforeEach(() => {
    storage = AudioStorage.instance;
  });

  afterEach(() => {
    for (const audio of storage.audios) {
      storage.delete(audio.identifier);
    }
    vi.restoreAllMocks();
  });

  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      expect(AudioStorage.instance).toBe(AudioStorage.instance);
    });
  });

  describe('add / get / delete', () => {
    it('adds and returns audio by url', () => {
      const audio = storage.add('https://example.com/test.mp3');
      expect(audio).toBeTruthy();
      expect(audio.identifier).toBe('https://example.com/test.mp3');
      const retrieved = storage.get('https://example.com/test.mp3');
      expect(retrieved).toBe(audio);
    });

    it('adds an audio file', () => {
      const file = AudioFile.create('https://example.com/music.ogg');
      const added = storage.add(file);
      expect(added).toBe(file);
    });

    it('returns nothing for an id it does not know', () => {
      expect(storage.get('nonexistent')).toBeFalsy();
    });

    it('removes audio', () => {
      storage.add('https://example.com/del.mp3');
      expect(storage.delete('https://example.com/del.mp3')).toBe(true);
      expect(storage.get('https://example.com/del.mp3')).toBeFalsy();
    });

    it('reports failure removing audio that is not there', () => {
      expect(storage.delete('nonexistent')).toBe(false);
    });
  });

  describe('audios', () => {
    it('lists what has been added', () => {
      storage.add('https://example.com/a.mp3');
      storage.add('https://example.com/b.mp3');
      expect(storage.audios.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getCatalog', () => {
    it('returns its catalogue', () => {
      storage.add('https://example.com/catalog.mp3');
      const catalog = storage.getCatalog();
      expect(Array.isArray(catalog)).toBe(true);
    });
  });

  describe('sending the catalogue', () => {
    const cancelWaiting = () =>
      (storage as unknown as { catalogSchedule: { cancel(): void } }).catalogSchedule.cancel();

    const catalogueTargets = () =>
      vi
        .mocked(Network.instance.send)
        .mock.calls.filter(([context]) => (context as { eventName: string }).eventName === 'SYNCHRONIZE_AUDIO_LIST')
        .map(([, sendTo]) => sendTo);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      cancelWaiting();
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
    });

    afterEach(() => {
      cancelWaiting();
      vi.useRealTimers();
    });

    it('sends a later waiting call to the peer that call names', () => {
      storage.lazySynchronize(1000, 'peer-a');
      vi.advanceTimersByTime(1000);
      storage.lazySynchronize(1000, 'peer-b');
      vi.advanceTimersByTime(1000);

      expect(catalogueTargets()).toEqual(['peer-a', 'peer-b']);
    });

    it('still tells everyone later after telling one peer now', () => {
      storage.lazySynchronize(1000);
      storage.synchronize('peer-a');
      vi.advanceTimersByTime(1000);

      expect(catalogueTargets()).toEqual(['peer-a', undefined]);
    });

    it('sends one catalogue once a quick run of added audio stops', () => {
      for (let n = 0; n < 10; n++) {
        storage.add(`https://example.com/run-${n}.mp3`);
        vi.advanceTimersByTime(50);
      }

      expect(catalogueTargets()).toEqual([]);
      vi.advanceTimersByTime(50);
      expect(catalogueTargets()).toEqual([undefined]);
    });
  });
});
