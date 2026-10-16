import { Network } from '@axe/core/network/network';
import { AssetHttpStore, AssetUploadResult } from '@axe/core/storage/asset-http-store';
import { ASSET_RETRY_DELAY_MS, AssetRetries } from '@axe/core/storage/asset-retries';
import { AudioFile, AudioFileContext } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import type { MockInstance } from 'vitest';

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

  describe('the asset server', () => {
    const store = AssetHttpStore.instance;
    const trackId = 'f'.repeat(64);
    const contextOf = (identifier: string): AudioFileContext => ({
      identifier,
      name: 'theme.ogg',
      type: 'audio/ogg',
      blob: new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], { type: 'audio/ogg' }),
      url: 'blob:track',
    });
    const catalogued = (identifier: string) => storage.getCatalog().some((item) => item.identifier === identifier);
    const cancelWaiting = () =>
      (storage as unknown as { catalogSchedule: { cancel(): void } }).catalogSchedule.cancel();

    let finishUpload: (result: AssetUploadResult) => void;
    let upload: MockInstance<AssetHttpStore['upload']>;

    beforeEach(() => {
      store.configure('https://rooms.example');
      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      upload = vi
        .spyOn(store, 'upload')
        .mockReturnValue(new Promise<AssetUploadResult>((resolve) => (finishUpload = resolve)));
    });

    afterEach(() => {
      store.configure(null);
      store.useAccess(null);
      cancelWaiting();
      (storage as unknown as { uploadRetries: AssetRetries }).uploadRetries.clear();
      vi.useRealTimers();
    });

    it('tries again one that ran out of time after it was asked for again while going, as on coming back', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(AudioFile.create(contextOf(trackId)));
      storage.uploadAllToAssetStore();
      expect(upload).toHaveBeenCalledTimes(1);

      finishUpload('timedOut');
      await vi.advanceTimersByTimeAsync(0);
      upload.mockClear().mockResolvedValue('stored');
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS);

      expect(upload).toHaveBeenCalledTimes(1);
    });

    it('tries no upload again that ran out of the time its size was given', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      storage.add(AudioFile.create(contextOf(trackId)));
      finishUpload('timedOut');
      await vi.advanceTimersByTimeAsync(0);
      upload.mockClear();

      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(upload).not.toHaveBeenCalled();
    });

    it.each([
      ['made a guest', 'guest', 'room-a'],
      ['gone to another room', 'pl', 'room-b'],
    ] as const)('tries no failed upload again for a seat %s since', async (_case, roleThen, roomThen) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(AudioFile.create(contextOf(trackId)));
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);
      upload.mockClear().mockResolvedValue('failed');

      role.mockReturnValue(roleThen);
      room.mockReturnValue(roomThen);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);

      expect(upload).not.toHaveBeenCalled();
    });

    it('tries an upload that failed again a few times, further apart each time', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(AudioFile.create(contextOf(trackId)));
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);
      upload.mockClear().mockResolvedValue('failed');

      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS);
      expect(upload).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2);
      expect(upload).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 4);
      expect(upload).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(3);
    });

    it('puts a sound a peer sent up for a GM or a PL, where the store was found to lack it, but not for a guest', async () => {
      storage.add(contextOf(trackId));
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('guest');

      storage.uploadReceived(trackId);
      expect(upload).not.toHaveBeenCalled();

      role.mockReturnValue('gm');
      storage.uploadReceived(trackId);
      expect(upload).toHaveBeenCalledWith(trackId, expect.any(Blob), 'theme.ogg');
      finishUpload('stored');
      await vi.waitFor(() => expect(catalogued(trackId)).toBe(true));
    });

    it('sends audio made on this seat to the server, and names it to peers only once it is there', async () => {
      const audio = AudioFile.create(contextOf(trackId));

      storage.add(audio);

      expect(upload).toHaveBeenCalledWith(trackId, audio.blob, 'theme.ogg');
      expect(catalogued(trackId)).toBe(false);
      finishUpload('exists');
      await vi.waitFor(() => expect(catalogued(trackId)).toBe(true));
    });

    it('sends every sound held in full up to a room just entered, received ones too', async () => {
      storage.add(contextOf(trackId));
      storage.add('https://example.com/theme.mp3');

      storage.uploadAllToAssetStore();

      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload).toHaveBeenCalledWith(trackId, expect.any(Blob), 'theme.ogg');
      finishUpload('exists');
      await vi.waitFor(() => expect(catalogued(trackId)).toBe(true));
    });

    it('leaves audio received from a peer where it came from', () => {
      storage.add(contextOf(trackId));

      expect(upload).not.toHaveBeenCalled();
      expect(catalogued(trackId)).toBe(true);
    });

    it('sends neither linked audio nor a placeholder', () => {
      storage.add('https://example.com/theme.mp3');
      storage.add(AudioFile.createEmpty('0'.repeat(64)));

      expect(upload).not.toHaveBeenCalled();
    });
  });
});
