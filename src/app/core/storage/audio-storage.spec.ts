import { Network } from '@axe/core/network/network';
import { AssetHttpStore, AssetUploadResult } from '@axe/core/storage/asset-http-store';
import {
  ASSET_LAST_TRY_DELAY_MS,
  ASSET_RETRY_DELAY_MS,
  AssetRetries,
  RECEIVED_UPLOAD_TURN_MS,
  receivedUploadTurnMs,
} from '@axe/core/storage/asset-retries';
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
      const pending = new Promise<AssetUploadResult>((resolve) => (finishUpload = resolve));
      upload = vi.spyOn(store, 'upload').mockReturnValue(pending);
    });

    afterEach(() => {
      store.configure(null);
      store.useAccess(null);
      cancelWaiting();
      (storage as unknown as { uploadRetries: AssetRetries }).uploadRetries.clear();
      (storage as unknown as { missedUploads: Set<string> }).missedUploads.clear();
      (storage as unknown as { uploading: Set<string> }).uploading.clear();
      (storage as unknown as { gaveUp: Set<string> }).gaveUp.clear();
      (storage as unknown as { clearLastTries(): void }).clearLastTries();
      vi.useRealTimers();
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

    it('has something yet to go up while it is going up or kept for later, and nothing once it is there', async () => {
      storage.add(AudioFile.create(contextOf(trackId)));
      expect(storage.hasUploadsPending).toBe(true);
      finishUpload('stored');
      await vi.waitFor(() => expect(storage.hasUploadsPending).toBe(false));

      store.useAccess(() => null);
      storage.add(AudioFile.create(contextOf('c'.repeat(64))));

      expect(storage.hasUploadsPending).toBe(true);
    });

    it('waits its turn to put up one a peer sent, and puts nothing up for a room left meanwhile', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(contextOf(trackId));
      storage.receivedUploadTurn = () => 2;
      const turns = 2 * receivedUploadTurnMs(storage.get(trackId)!.blob!.size);
      try {
        storage.uploadReceived(trackId);
        await vi.advanceTimersByTimeAsync(turns - 1);
        expect(upload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(upload).toHaveBeenCalledTimes(1);

        finishUpload('stored');
        await vi.advanceTimersByTimeAsync(0);
        storage.uploadReceived(trackId);
        room.mockReturnValue('room-b');
        await vi.advanceTimersByTimeAsync(turns);
        expect(upload).toHaveBeenCalledTimes(1);
      } finally {
        storage.receivedUploadTurn = () => 0;
      }
    });

    it('waits a turn long enough for the bytes to go up over a slow line', () => {
      expect(receivedUploadTurnMs(0)).toBe(RECEIVED_UPLOAD_TURN_MS);
      expect(receivedUploadTurnMs(10 * 1024 * 1024)).toBeGreaterThan(40_000);
    });

    it('gives one whose tries ran out a last try a while later, once in the room, and counts it till then', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(AudioFile.create(contextOf(trackId)));
      upload.mockResolvedValue('failed');
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(4);
      expect(storage.hasUploadsPending).toBe(true);

      storage.uploadMissedToAssetStore();
      await vi.advanceTimersByTimeAsync(0);
      expect(upload).toHaveBeenCalledTimes(4);

      await vi.advanceTimersByTimeAsync(ASSET_LAST_TRY_DELAY_MS + ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(5);
      await vi.advanceTimersByTimeAsync((ASSET_LAST_TRY_DELAY_MS + ASSET_RETRY_DELAY_MS * 8) * 3);
      expect(upload).toHaveBeenCalledTimes(5);
      expect(storage.hasUploadsPending).toBe(true);
    });

    it('stops counting one still to go up once the room is found to hold it, or it is deleted', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(AudioFile.create(contextOf(trackId)));
      upload.mockResolvedValue('failed');
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(storage.hasUploadsPending).toBe(true);

      storage.forgetUploaded([trackId]);
      expect(storage.hasUploadsPending).toBe(false);
      await vi.advanceTimersByTimeAsync(ASSET_LAST_TRY_DELAY_MS);
      expect(upload).toHaveBeenCalledTimes(4);

      store.useAccess(() => null);
      storage.add(AudioFile.create(contextOf('d'.repeat(64))));
      expect(storage.hasUploadsPending).toBe(true);
      storage.delete('d'.repeat(64));
      expect(storage.hasUploadsPending).toBe(false);
    });

    it('has nothing yet to go up for a guest, who puts nothing up, but for one going up', () => {
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('guest');
      store.useAccess(() => null);
      storage.add(AudioFile.create(contextOf(trackId)));
      expect(storage.hasUploadsPending).toBe(false);

      role.mockReturnValue('pl');

      expect(storage.hasUploadsPending).toBe(true);
    });

    it('has something yet to go up while a failed one waits to be tried again', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(AudioFile.create(contextOf(trackId)));
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);

      expect(storage.hasUploadsPending).toBe(true);
    });

    it.each([
      ['waiting to be tried again', true],
      ['waiting for the room to be in reach', false],
    ] as const)('names to peers one %s once the seat is a guest, who puts nothing up', async (_case, inReach) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(AudioFile.create(contextOf(trackId)));
      if (!inReach) store.useAccess(() => null);
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);
      expect(catalogued(trackId)).toBe(false);

      role.mockReturnValue('guest');

      expect(catalogued(trackId)).toBe(true);
    });

    it('puts one that went up to a room left meanwhile up to the room it is in now as well', async () => {
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(AudioFile.create(contextOf(trackId)));
      room.mockReturnValue('room-b');
      upload.mockResolvedValue('stored');

      finishUpload('stored');

      await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
      expect(upload.mock.calls[1][0]).toBe(trackId);
    });

    it.each([
      ['still in the room it went up to', 'room-a', 'pl', 'stored'],
      ['made a guest in the room it is in now', 'room-b', 'guest', 'exists'],
      ['whose try failed, left to the tries to come', 'room-b', 'pl', 'failed'],
    ] as const)('puts it up only once for a seat %s', async (_case, roomThen, roleThen, result) => {
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(AudioFile.create(contextOf(trackId)));
      room.mockReturnValue(roomThen);
      role.mockReturnValue(roleThen);
      upload.mockResolvedValue('stored');

      finishUpload(result);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(upload).toHaveBeenCalledTimes(1);
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
      expect(upload).toHaveBeenCalledWith(
        trackId,
        expect.any(Blob),
        'theme.ogg',
        expect.objectContaining({ first: false })
      );
      finishUpload('stored');
      await vi.waitFor(() => expect(catalogued(trackId)).toBe(true));
    });

    it('puts up a sound added while the room was out of reach once back, and asks about nothing else', async () => {
      storage.add(AudioFile.create(contextOf('c'.repeat(64))));
      upload.mockClear();
      store.useAccess(() => null);
      storage.add(AudioFile.create(contextOf(trackId)));
      expect(upload).not.toHaveBeenCalled();

      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      storage.uploadMissedToAssetStore();
      storage.uploadMissedToAssetStore();

      expect(upload.mock.calls.map(([identifier]) => identifier)).toEqual([trackId]);
      finishUpload('stored');
      await new Promise((resolve) => setTimeout(resolve, 0));
      storage.delete('c'.repeat(64));
    });

    it('keeps a sound turned away while the room was out of reach for when the seat is back, its tries unspent', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(AudioFile.create(contextOf(trackId)));
      store.useAccess(() => null);
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(catalogued(trackId)).toBe(false);

      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      upload.mockResolvedValue('failed');
      storage.uploadMissedToAssetStore();
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);

      // Back in reach, it has every try still to spend: the one just made and three more.
      expect(upload).toHaveBeenCalledTimes(5);
    });

    it('sends audio made on this seat to the server, and names it to peers only once it is there', async () => {
      const audio = AudioFile.create(contextOf(trackId));

      storage.add(audio);

      expect(upload).toHaveBeenCalledWith(trackId, audio.blob, 'theme.ogg', expect.objectContaining({ first: true }));
      expect(catalogued(trackId)).toBe(false);
      finishUpload('exists');
      await vi.waitFor(() => expect(catalogued(trackId)).toBe(true));
    });

    it('sends every sound held in full up to a room just entered, received ones too', async () => {
      storage.add(contextOf(trackId));
      storage.add('https://example.com/theme.mp3');

      storage.uploadAllToAssetStore();

      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload).toHaveBeenCalledWith(
        trackId,
        expect.any(Blob),
        'theme.ogg',
        expect.objectContaining({ first: false })
      );
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
