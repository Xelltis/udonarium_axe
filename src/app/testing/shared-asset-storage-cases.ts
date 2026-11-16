import { fileResourceUpdated$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore, AssetUploadResult } from '@axe/core/storage/asset-http-store';
import {
  ASSET_LAST_TRY_DELAY_MS,
  ASSET_PAUSE_RETRY_MS,
  ASSET_PUT_BACK_CHECK_MS,
  ASSET_RETRY_DELAY_MS,
  AssetRetries,
  RECEIVED_UPLOAD_TURN_MS,
  receivedUploadTurnMs,
} from '@axe/core/storage/asset-retries';
import { SharedAssetContext, SharedAssetFile, SharedAssetStorage } from '@axe/core/storage/shared-asset-storage';
import type { FakeTimersConfig, MockInstance } from 'vitest';

/** What makes the files of one kind, as the specs read it off the class: AudioFile, ImageFile or ModelFile. */
export interface SharedAssetFileFactory<F, C> {
  create(context: C): F;
  createEmpty(identifier: string): F;
  createAsync(blob: Blob): Promise<F>;
}

/** One kind of shared file, as the cases every kind's store answers alike need to know it. */
export interface SharedAssetStorageKindCase<
  S extends SharedAssetStorage<F, C>,
  F extends SharedAssetFile<C>,
  C extends SharedAssetContext,
> {
  /** The store's class name, heading the cases. */
  name: string;
  /** The kind as the cases name one: a sound, a picture, a model. */
  noun: string;
  storage: () => S;
  /** Every file the store knows of, as the kind's own getter lists them. */
  files: (storage: S) => F[];
  file: SharedAssetFileFactory<F, C>;
  /** A whole context under the identifier, as one received from a peer, named `uploadName`. */
  contextOf: (identifier: string) => C;
  /** The name the bytes go up to the asset store under. */
  uploadName: string;
  /**
   * Bytes the kind reads into a file of its own, for reading the same bytes twice; left out where
   * reading needs more than happy-dom has.
   */
  readable?: () => Blob;
}

/** The store under test and what the cases make for it, for the cases one kind adds of its own. */
export interface SharedAssetStorageHarness<
  S extends SharedAssetStorage<F, C>,
  F extends SharedAssetFile<C>,
  C extends SharedAssetContext,
> {
  readonly storage: S;
  readonly file: SharedAssetFileFactory<F, C>;
  contextOf(identifier: string): C;
  /** Adds one as chosen to be added, as a file picked or dropped is. */
  choose(file: F): F;
}

/** The harness with an asset server configured and the store's upload answered by hand. */
export interface AssetServerHarness<
  S extends SharedAssetStorage<F, C>,
  F extends SharedAssetFile<C>,
  C extends SharedAssetContext,
> extends SharedAssetStorageHarness<S, F, C> {
  readonly store: AssetHttpStore;
  readonly upload: MockInstance<AssetHttpStore['upload']>;
  /** The identifier the cases hold one under. */
  readonly heldId: string;
  finishUpload(result: AssetUploadResult): void;
  catalogued(identifier: string): boolean;
  /** The identifiers each catalogue sent to peers named, in the order sent. */
  sentCatalogues(): string[][];
}

export interface SharedAssetStorageExtraCases<
  S extends SharedAssetStorage<F, C>,
  F extends SharedAssetFile<C>,
  C extends SharedAssetContext,
> {
  /** Cases of the kind's own on the store as it stands, run with the store emptied after each. */
  held?: (harness: SharedAssetStorageHarness<S, F, C>) => void;
  /** Cases of the kind's own with an asset server configured. */
  assetServer?: (harness: AssetServerHarness<S, F, C>) => void;
}

const fakeTimers = (): FakeTimersConfig => ({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
const ROOM_KEY = '0123456789abcdef0123456789abcdef';

/**
 * The cases every kind of SharedAssetStorage answers alike: holding, removal by the room, the
 * catalogue and the asset server. What one kind does of its own goes in `extra`.
 */
export function describeSharedAssetStorage<
  S extends SharedAssetStorage<F, C>,
  F extends SharedAssetFile<C>,
  C extends SharedAssetContext,
>(kind: SharedAssetStorageKindCase<S, F, C>, extra: SharedAssetStorageExtraCases<S, F, C> = {}): void {
  const { noun, file, contextOf, uploadName } = kind;

  describe(kind.name, () => {
    let storage: S;

    const choose = (chosen: F): F =>
      (storage as unknown as { _add(file: F, isLocal: boolean, putBack: boolean): F })._add(chosen, true, true);

    const harness: SharedAssetStorageHarness<S, F, C> = {
      get storage() {
        return storage;
      },
      file,
      contextOf,
      choose,
    };

    const cancelWaiting = () =>
      (storage as unknown as { catalogSchedule: { cancel(): void } }).catalogSchedule.cancel();

    beforeEach(() => {
      storage = kind.storage();
    });

    afterEach(() => {
      for (const held of kind.files(storage)) {
        storage.delete(held.identifier);
      }
      vi.restoreAllMocks();
    });

    describe('instance (singleton)', () => {
      it('returns the one instance', () => {
        expect(kind.storage()).toBe(kind.storage());
      });
    });

    describe('add / get / delete', () => {
      if (kind.readable) {
        const readable = kind.readable;
        it(`lets go of the bytes read again of a ${noun} held already, keeping those it holds`, async () => {
          const revoked = vi.spyOn(URL, 'revokeObjectURL');
          const held = await storage.addAsync(readable());

          expect(await storage.addAsync(readable())).toBe(held);
          expect(revoked).toHaveBeenCalledTimes(1);
          expect(revoked).not.toHaveBeenCalledWith(held!.url);
        });
      }

      it('finds nothing under a name every object has of its own', () => {
        expect(storage.get('toString')).toBeNull();
        expect(storage.get('constructor')).toBeNull();
        expect(storage.get('__proto__')).toBeNull();
      });

      it(`adds and returns a ${noun} received from a peer`, () => {
        const received = storage.add(contextOf('test'));
        expect(received).toBeTruthy();
        expect(received.identifier).toBe('test');
        expect(storage.get('test')).toBe(received);
      });

      it(`adds a ${noun} file`, () => {
        const made = file.create(contextOf('tree'));
        const added = storage.add(made);
        expect(added).toBe(made);
        expect(storage.get('tree')).toBe(made);
      });

      it('returns nothing for an id it does not know', () => {
        expect(storage.get('nonexistent')).toBeFalsy();
      });

      it(`removes a ${noun}`, () => {
        storage.add(contextOf('del'));
        expect(storage.delete('del')).toBe(true);
        expect(storage.get('del')).toBeFalsy();
      });

      it(`reports failure removing a ${noun} that is not there`, () => {
        expect(storage.delete('nonexistent')).toBe(false);
      });
    });

    describe(`telling the app a ${noun} was added here`, () => {
      const madeHere = 'f'.repeat(64);

      afterEach(() => {
        storage.onAddedLocally = () => {};
      });

      it('tells it of one made here whole, and of none from a peer or still to come', () => {
        const added = vi.fn();
        storage.onAddedLocally = added;

        storage.add(contextOf(madeHere));
        storage.add(file.createEmpty('g'.repeat(64)));
        expect(added).not.toHaveBeenCalled();

        storage.add(file.create(contextOf(madeHere)));
        expect(added.mock.calls).toEqual([[madeHere]]);
      });
    });

    describe(`a ${noun} the room removed`, () => {
      const removedId = 'e'.repeat(64);

      afterEach(() => {
        storage.unmarkRemoved(removedId);
        storage.putBack = () => false;
        storage.onRefused = () => {};
      });

      it('is let go of, keeps its mark, and the files are said to have changed', () => {
        storage.add(file.create(contextOf(removedId)));
        const changed = vi.fn();
        const off = fileResourceUpdated$.subscribe(changed);

        storage.markRemoved(removedId);
        off();

        expect(storage.get(removedId)).toBeNull();
        expect(storage.isRemoved(removedId)).toBe(true);
        expect(storage.getCatalog().map((item) => item.identifier)).not.toContain(removedId);
        expect(changed).toHaveBeenCalledTimes(1);
      });

      it('is kept out when it comes again unchosen: from a peer, as a placeholder or added here by itself', () => {
        const putBack = vi.fn(() => true);
        storage.putBack = putBack;
        storage.markRemoved(removedId);

        storage.add(file.createEmpty(removedId));
        storage.add(contextOf(removedId));
        storage.add(file.create(contextOf(removedId)));

        expect(storage.get(removedId)).toBeNull();
        expect(storage.isRemoved(removedId)).toBe(true);
        expect(putBack).not.toHaveBeenCalled();
      });

      it('is handed back as nothing when added and kept out, and as stored when put back', async () => {
        vi.spyOn(file, 'createAsync').mockImplementation(async () => file.create(contextOf(removedId)));
        storage.markRemoved(removedId);

        expect(await storage.addAsync(new Blob([new Uint8Array([1])]))).toBeNull();
        storage.putBack = () => true;
        expect((await storage.addAsync(new Blob([new Uint8Array([1])]), { putBack: true }))?.identifier).toBe(
          removedId
        );
        expect(storage.get(removedId)).not.toBeNull();
      });

      it('is put back when chosen to be added in full by a seat that may', () => {
        const putBack = vi.fn(() => true);
        storage.putBack = putBack;
        storage.markRemoved(removedId);

        choose(file.create(contextOf(removedId)));

        expect(storage.get(removedId)).not.toBeNull();
        expect(storage.isRemoved(removedId)).toBe(false);
        expect(putBack.mock.calls).toEqual([[removedId]]);
      });

      it('is kept out, and the app told, when chosen by a seat that may not put it back', () => {
        const refused = vi.fn();
        storage.putBack = () => false;
        storage.onRefused = refused;
        storage.markRemoved(removedId);

        choose(file.create(contextOf(removedId)));

        expect(storage.get(removedId)).toBeNull();
        expect(storage.isRemoved(removedId)).toBe(true);
        expect(refused.mock.calls).toEqual([[removedId]]);
      });
    });

    describe('what it holds', () => {
      it('lists what has been added', () => {
        storage.add(contextOf('a'));
        storage.add(contextOf('b'));
        expect(kind.files(storage).length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('getCatalog', () => {
      it('returns its catalogue', () => {
        storage.add(contextOf('catalog'));
        const catalog = storage.getCatalog();
        expect(Array.isArray(catalog)).toBe(true);
      });
    });

    describe('sending the catalogue', () => {
      const catalogueTargets = () =>
        vi
          .mocked(Network.instance.send)
          .mock.calls.filter(([context]) => (context as { eventName: string }).eventName === storage.catalogMessage)
          .map(([, sendTo]) => sendTo);

      beforeEach(() => {
        vi.useFakeTimers(fakeTimers());
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

      it(`sends one catalogue once a quick run of added ${noun}s stops`, () => {
        for (let n = 0; n < 10; n++) {
          storage.add(contextOf(`run-${n}`));
          vi.advanceTimersByTime(50);
        }

        expect(catalogueTargets()).toEqual([]);
        vi.advanceTimersByTime(50);
        expect(catalogueTargets()).toEqual([undefined]);
      });
    });

    describe('the asset server', () => {
      const store = AssetHttpStore.instance;
      const heldId = 'f'.repeat(64);
      const catalogued = (identifier: string) => storage.getCatalog().some((item) => item.identifier === identifier);
      const sentCatalogues = () =>
        vi
          .mocked(Network.instance.send)
          .mock.calls.map(([context]) => context as { eventName: string; data: { identifier: string }[] })
          .filter((context) => context.eventName === storage.catalogMessage)
          .map((context) => context.data.map((item) => item.identifier));

      let finishUpload: (result: AssetUploadResult) => void;
      let upload: MockInstance<AssetHttpStore['upload']>;

      const serverHarness: AssetServerHarness<S, F, C> = {
        get storage() {
          return storage;
        },
        file,
        contextOf,
        choose,
        store,
        get upload() {
          return upload;
        },
        heldId,
        finishUpload: (result) => finishUpload(result),
        catalogued,
        sentCatalogues,
      };

      beforeEach(() => {
        store.configure('https://rooms.example');
        store.useAccess(() => ({ roomKey: ROOM_KEY, token: 'asset-1' }));
        vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
        cancelWaiting();
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
        (storage as unknown as { upAgain: Set<string> }).upAgain.clear();
        (storage as unknown as { gaveUp: Set<string> }).gaveUp.clear();
        (storage as unknown as { addedUnnamed: Set<string> }).addedUnnamed.clear();
        (storage as unknown as { clearLastTries(): void }).clearLastTries();
        (storage as unknown as { pausedUploads: Set<string> }).pausedUploads.clear();
        (storage as unknown as { barred: Set<string> }).barred.clear();
        (storage as unknown as { stopPausedRetry(): void }).stopPausedRetry();
        vi.useRealTimers();
      });

      describe('one the room removed while it was going up', () => {
        afterEach(() => {
          storage.putBack = () => false;
          storage.unmarkRemoved(heldId);
          storage.onUploadedWhileRemoved = () => {};
        });

        it('asks the store again a while after it is put back, past a removal another seat had under way', async () => {
          vi.useFakeTimers(fakeTimers());
          vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('gm');
          upload.mockResolvedValue('exists');
          storage.putBack = () => true;
          storage.markRemoved(heldId);

          choose(file.create(contextOf(heldId)));
          await vi.advanceTimersByTimeAsync(0);
          expect(upload).toHaveBeenCalledTimes(1);
          await vi.advanceTimersByTimeAsync(ASSET_PUT_BACK_CHECK_MS);

          expect(upload).toHaveBeenCalledTimes(2);
        });

        it('asks nothing again of the store once the seat is in another room', async () => {
          vi.useFakeTimers(fakeTimers());
          vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('gm');
          const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
          upload.mockResolvedValue('exists');
          storage.putBack = () => true;
          storage.markRemoved(heldId);

          choose(file.create(contextOf(heldId)));
          await vi.advanceTimersByTimeAsync(0);
          room.mockReturnValue('room-b');
          await vi.advanceTimersByTimeAsync(ASSET_PUT_BACK_CHECK_MS);

          expect(upload).toHaveBeenCalledTimes(1);
        });

        it('has the app take out bytes that reached the store all the same, and keeps nothing to try again', async () => {
          const uploaded = vi.fn();
          storage.onUploadedWhileRemoved = uploaded;
          vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('gm');
          storage.add(file.create(contextOf(heldId)));

          storage.markRemoved(heldId);
          finishUpload('stored');
          await vi.waitFor(() => expect(uploaded).toHaveBeenCalledTimes(1));

          expect(uploaded.mock.calls).toEqual([[heldId]]);
          expect(storage.hasUploadsPending).toBe(false);
        });

        it('stops a try still to come, which would keep it counted as still to go up', async () => {
          vi.useFakeTimers(fakeTimers());
          vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
          upload.mockResolvedValue('failed');
          storage.add(file.create(contextOf(heldId)));
          await vi.advanceTimersByTimeAsync(0);
          expect(storage.hasUploadsPending).toBe(true);

          storage.markRemoved(heldId);

          expect(storage.hasUploadsPending).toBe(false);
        });
      });

      describe(`telling the app a ${noun} made here was added`, () => {
        const added = vi.fn();

        beforeEach(() => {
          added.mockReset();
          storage.onAddedLocally = added;
          vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        });

        afterEach(() => {
          storage.onAddedLocally = () => {};
        });

        it('waits until it is in the store, as one on its way up is named to nobody', async () => {
          storage.add(file.create(contextOf(heldId)));
          await Promise.resolve();
          expect(added).not.toHaveBeenCalled();

          finishUpload('stored');

          await vi.waitFor(() => expect(added.mock.calls).toEqual([[heldId]]));
        });

        it('says nothing of one the operator holds back or bars', async () => {
          upload.mockResolvedValueOnce('paused').mockResolvedValueOnce('blocked');
          const barredId = 'b'.repeat(64);
          storage.add(file.create(contextOf(heldId)));
          storage.add(file.create(contextOf(barredId)));

          await vi.waitFor(() => expect(storage.isHeldBack(barredId)).toBe(true));
          expect(storage.isHeldBack(heldId)).toBe(true);
          expect(added).not.toHaveBeenCalled();
        });

        it('tells it once the seat gives up putting it there, and names it to peers', async () => {
          vi.useFakeTimers(fakeTimers());
          upload.mockResolvedValue('failed');
          storage.add(file.create(contextOf(heldId)));
          await vi.advanceTimersByTimeAsync(0);
          expect(added).not.toHaveBeenCalled();

          await vi.advanceTimersByTimeAsync(120_000);

          expect(added.mock.calls).toEqual([[heldId]]);
        });
      });

      it('holds nothing back for the stop as a guest, who names to peers what it was to put up', async () => {
        const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        upload.mockResolvedValue('paused');
        storage.add(file.create(contextOf(heldId)));
        await vi.waitFor(() => expect(storage.isHeldBack(heldId)).toBe(true));

        role.mockReturnValue('guest');

        expect(storage.isHeldBack(heldId)).toBe(false);
      });

      it('keeps barred one a later try could not put up just then, which says nothing of the bar', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        upload.mockResolvedValueOnce('blocked').mockResolvedValue('failed');
        storage.add(file.create(contextOf(heldId)));
        await vi.advanceTimersByTimeAsync(0);

        storage.uploadAllToAssetStore();
        await vi.advanceTimersByTimeAsync(600_000);

        expect(storage.isHeldBack(heldId)).toBe(true);
        expect(catalogued(heldId)).toBe(false);
      });

      it('waits with all still held while the seat may not put anything up, and tries once it may again', async () => {
        vi.useFakeTimers(fakeTimers());
        const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        upload.mockResolvedValue('paused');
        storage.add(file.create(contextOf(heldId)));
        await vi.advanceTimersByTimeAsync(0);
        upload.mockClear();

        role.mockReturnValue('guest');
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);
        expect(upload).not.toHaveBeenCalled();
        role.mockReturnValue('pl');
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);

        expect(upload.mock.calls.map(([identifier]) => identifier)).toEqual([heldId]);
      });

      it('tries the rest later when the one tried whether the stop is over is barred instead', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const larger = 'c'.repeat(64);
        upload.mockResolvedValue('paused');
        storage.add(file.create(contextOf(heldId)));
        storage.add(file.create({ ...contextOf(larger), blob: new Blob([new Uint8Array(64)]) }));
        await vi.advanceTimersByTimeAsync(0);
        upload.mockClear().mockResolvedValueOnce('blocked');

        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);

        expect(upload.mock.calls.map(([identifier]) => identifier)).toEqual([heldId, larger]);
        storage.delete(larger);
      });

      it('asks the store to try whether the stop is over, and tries the next later when one goes up no more', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const gone = 'c'.repeat(64);
        upload.mockResolvedValue('paused');
        storage.add(file.create(contextOf(gone)));
        storage.add(file.create(contextOf(heldId)));
        await vi.advanceTimersByTimeAsync(0);
        storage.delete(gone);
        storage.delete(heldId);
        storage.add(file.create({ ...contextOf(heldId), blob: new Blob([new Uint8Array(64)]) }));
        upload.mockClear();
        (storage as unknown as { uploading: Set<string> }).uploading.clear();
        (storage as unknown as { pausedUploads: Set<string> }).pausedUploads.add(gone).add(heldId);

        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);
        expect(upload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);

        expect(upload.mock.calls.map(([identifier, , , options]) => [identifier, options])).toEqual([
          [heldId, { first: false, probe: true }],
        ]);
        storage.delete(heldId);
      });

      it('holds what the operator’s stop turned away from peers, tries one now and then, and the rest once one goes up', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const ids = [heldId, 'c'.repeat(64), 'd'.repeat(64)];
        upload.mockResolvedValue('paused');
        for (const identifier of ids) storage.add(file.create(contextOf(identifier)));
        await vi.advanceTimersByTimeAsync(0);

        expect(ids.filter(catalogued)).toEqual([]);
        expect(ids.every((identifier) => storage.isHeldBack(identifier))).toBe(true);
        expect(storage.hasUploadsPending).toBe(true);

        // Still stopped a minute later: the one tried is held again.
        upload.mockClear();
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(ids.filter(catalogued)).toEqual([]);

        // One found there already does not show the stop is over, so the rest wait for the next try.
        upload.mockClear().mockResolvedValueOnce('exists').mockResolvedValue('stored');
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(ids.filter(catalogued)).toHaveLength(1);

        // One kept anew shows it is over: the last goes up at once after it.
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);
        expect(upload).toHaveBeenCalledTimes(3);
        expect(ids.filter(catalogued)).toEqual(ids);
        expect(storage.hasUploadsPending).toBe(false);
        for (const identifier of ids.slice(1)) storage.delete(identifier);
      });

      it('tries the smallest of what the stop held, since its bytes may all be sent before the answer', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const larger = 'c'.repeat(64);
        upload.mockResolvedValue('paused');
        storage.add(file.create({ ...contextOf(larger), blob: new Blob([new Uint8Array(1024)]) }));
        storage.add(file.create(contextOf(heldId)));
        await vi.advanceTimersByTimeAsync(0);

        upload.mockClear();
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);

        expect(upload.mock.calls.map(([identifier]) => identifier)).toEqual([heldId]);
        storage.delete(larger);
      });

      it('puts up what the stop held on entering a room, rather than waiting for the next try', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        upload.mockResolvedValue('paused');
        storage.add(file.create(contextOf(heldId)));
        await vi.advanceTimersByTimeAsync(0);

        upload.mockClear().mockResolvedValue('stored');
        storage.uploadAllToAssetStore();
        await vi.advanceTimersByTimeAsync(ASSET_PAUSE_RETRY_MS);

        expect(upload).toHaveBeenCalledTimes(1);
        expect(catalogued(heldId)).toBe(true);
      });

      it('keeps what the operator barred to this seat: named to no peer, tried no more, and not still to go up', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        upload.mockResolvedValue('blocked');
        storage.add(file.create(contextOf(heldId)));
        await vi.advanceTimersByTimeAsync(ASSET_LAST_TRY_DELAY_MS * 2);

        expect(upload).toHaveBeenCalledTimes(1);
        expect(catalogued(heldId)).toBe(false);
        expect(storage.isHeldBack(heldId)).toBe(true);
        expect(storage.hasUploadsPending).toBe(false);

        // Let back in by the operator, it goes up on entering a room and is named again.
        upload.mockResolvedValue('stored');
        storage.uploadAllToAssetStore();
        await vi.advanceTimersByTimeAsync(0);
        expect(catalogued(heldId)).toBe(true);
        expect(storage.isHeldBack(heldId)).toBe(false);
      });

      it('keeps holding back one the operator barred though the room is found to list it still', async () => {
        upload.mockResolvedValue('blocked');
        storage.add(file.create(contextOf(heldId)));
        await vi.waitFor(() => expect(storage.isHeldBack(heldId)).toBe(true));

        storage.forgetUploaded([heldId]);

        expect(storage.isHeldBack(heldId)).toBe(true);
        expect(catalogued(heldId)).toBe(false);
      });

      it('puts one up again once the upload under way ends, when asked to while it was going up', async () => {
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('gm');
        storage.add(file.create(contextOf(heldId)));
        expect(upload).toHaveBeenCalledTimes(1);

        storage.putUpAgain(heldId);
        expect(upload).toHaveBeenCalledTimes(1);
        upload.mockResolvedValue('stored');
        finishUpload('exists');

        await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(upload).toHaveBeenCalledTimes(2);
      });

      it('names one the room’s store is too full to keep to peers, who pass it on as before', async () => {
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        upload.mockResolvedValue('full');
        storage.add(file.create(contextOf(heldId)));

        await vi.waitFor(() => expect(catalogued(heldId)).toBe(true));
        expect(storage.isHeldBack(heldId)).toBe(false);
        expect(storage.hasUploadsPending).toBe(false);
      });

      it('forgets holding one back once it is deleted', async () => {
        upload.mockResolvedValue('blocked');
        storage.add(file.create(contextOf(heldId)));
        await vi.waitFor(() => expect(storage.isHeldBack(heldId)).toBe(true));

        storage.delete(heldId);

        expect(storage.isHeldBack(heldId)).toBe(false);
      });

      it.each([
        ['made a guest', 'guest', 'room-a'],
        ['gone to another room', 'pl', 'room-b'],
      ] as const)('tries no failed upload again for a seat %s since', async (_case, roleThen, roomThen) => {
        vi.useFakeTimers(fakeTimers());
        const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
        storage.add(file.create(contextOf(heldId)));
        finishUpload('failed');
        await vi.advanceTimersByTimeAsync(0);
        upload.mockClear().mockResolvedValue('failed');

        role.mockReturnValue(roleThen);
        room.mockReturnValue(roomThen);
        await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);

        expect(upload).not.toHaveBeenCalled();
      });

      it('has something yet to go up while it is going up or kept for later, and nothing once it is there', async () => {
        storage.add(file.create(contextOf(heldId)));
        expect(storage.hasUploadsPending).toBe(true);
        finishUpload('stored');
        await vi.waitFor(() => expect(storage.hasUploadsPending).toBe(false));

        store.useAccess(() => null);
        storage.add(file.create(contextOf('c'.repeat(64))));

        expect(storage.hasUploadsPending).toBe(true);
      });

      it('waits its turn to put up one a peer sent, and puts nothing up for a room left meanwhile', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
        storage.add(contextOf(heldId));
        storage.receivedUploadTurn = () => 2;
        const turns = 2 * receivedUploadTurnMs(storage.get(heldId)!.blob!.size);
        try {
          storage.uploadReceived(heldId);
          await vi.advanceTimersByTimeAsync(turns - 1);
          expect(upload).not.toHaveBeenCalled();
          await vi.advanceTimersByTimeAsync(1);
          expect(upload).toHaveBeenCalledTimes(1);

          finishUpload('stored');
          await vi.advanceTimersByTimeAsync(0);
          storage.uploadReceived(heldId);
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
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        storage.add(file.create(contextOf(heldId)));
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
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        storage.add(file.create(contextOf(heldId)));
        upload.mockResolvedValue('failed');
        finishUpload('failed');
        await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
        expect(storage.hasUploadsPending).toBe(true);

        storage.forgetUploaded([heldId]);
        expect(storage.hasUploadsPending).toBe(false);
        await vi.advanceTimersByTimeAsync(ASSET_LAST_TRY_DELAY_MS);
        expect(upload).toHaveBeenCalledTimes(4);

        store.useAccess(() => null);
        storage.add(file.create(contextOf('d'.repeat(64))));
        expect(storage.hasUploadsPending).toBe(true);
        storage.delete('d'.repeat(64));
        expect(storage.hasUploadsPending).toBe(false);
      });

      it('has nothing yet to go up for a guest, who puts nothing up, but for one going up', () => {
        const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('guest');
        store.useAccess(() => null);
        storage.add(file.create(contextOf(heldId)));
        expect(storage.hasUploadsPending).toBe(false);

        role.mockReturnValue('pl');

        expect(storage.hasUploadsPending).toBe(true);
      });

      it('has something yet to go up while a failed one waits to be tried again', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        storage.add(file.create(contextOf(heldId)));
        finishUpload('failed');
        await vi.advanceTimersByTimeAsync(0);

        expect(storage.hasUploadsPending).toBe(true);
      });

      it.each([
        ['waiting to be tried again', true],
        ['waiting for the room to be in reach', false],
      ] as const)('names to peers one %s once the seat is a guest, who puts nothing up', async (_case, inReach) => {
        vi.useFakeTimers(fakeTimers());
        const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        storage.add(file.create(contextOf(heldId)));
        if (!inReach) store.useAccess(() => null);
        finishUpload('failed');
        await vi.advanceTimersByTimeAsync(0);
        expect(catalogued(heldId)).toBe(false);

        role.mockReturnValue('guest');

        expect(catalogued(heldId)).toBe(true);
      });

      it('puts one that went up to a room left meanwhile up to the room it is in now as well', async () => {
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
        storage.add(file.create(contextOf(heldId)));
        room.mockReturnValue('room-b');
        upload.mockResolvedValue('stored');

        finishUpload('stored');

        await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
        expect(upload.mock.calls[1][0]).toBe(heldId);
      });

      it.each([
        ['still in the room it went up to', 'room-a', 'pl', 'stored'],
        ['made a guest in the room it is in now', 'room-b', 'guest', 'exists'],
        ['whose try failed, left to the tries to come', 'room-b', 'pl', 'failed'],
      ] as const)('puts it up only once for a seat %s', async (_case, roomThen, roleThen, result) => {
        const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
        storage.add(file.create(contextOf(heldId)));
        room.mockReturnValue(roomThen);
        role.mockReturnValue(roleThen);
        upload.mockResolvedValue('stored');

        finishUpload(result);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(upload).toHaveBeenCalledTimes(1);
      });

      it('tries an upload that failed again a few times, further apart each time', async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        storage.add(file.create(contextOf(heldId)));
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

      it.each(['gm', 'pl'] as const)(
        `puts a ${noun} a peer sent up for a %s, where the store was found to lack it, but not for a guest`,
        async (mayPutUp) => {
          storage.add(contextOf(heldId));
          const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('guest');

          storage.uploadReceived(heldId);
          expect(upload).not.toHaveBeenCalled();

          role.mockReturnValue(mayPutUp);
          storage.uploadReceived(heldId);
          expect(upload).toHaveBeenCalledWith(
            heldId,
            expect.any(Blob),
            uploadName,
            expect.objectContaining({ first: false })
          );
          finishUpload('stored');
          await vi.waitFor(() => expect(catalogued(heldId)).toBe(true));
        }
      );

      it(`puts up a ${noun} added while the room was out of reach once back, and asks about nothing else`, async () => {
        storage.add(file.create(contextOf('c'.repeat(64))));
        upload.mockClear();
        store.useAccess(() => null);
        storage.add(file.create(contextOf(heldId)));
        expect(upload).not.toHaveBeenCalled();

        store.useAccess(() => ({ roomKey: ROOM_KEY, token: 'asset-1' }));
        storage.uploadMissedToAssetStore();
        storage.uploadMissedToAssetStore();

        expect(upload.mock.calls.map(([identifier]) => identifier)).toEqual([heldId]);
        finishUpload('stored');
        await new Promise((resolve) => setTimeout(resolve, 0));
        storage.delete('c'.repeat(64));
      });

      it(`keeps a ${noun} turned away while the room was out of reach for when the seat is back, its tries unspent`, async () => {
        vi.useFakeTimers(fakeTimers());
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        storage.add(file.create(contextOf(heldId)));
        store.useAccess(() => null);
        finishUpload('failed');
        await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(catalogued(heldId)).toBe(false);

        store.useAccess(() => ({ roomKey: ROOM_KEY, token: 'asset-1' }));
        upload.mockResolvedValue('failed');
        storage.uploadMissedToAssetStore();
        await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);

        // Back in reach, it has every try still to spend: the one just made and three more.
        expect(upload).toHaveBeenCalledTimes(5);
      });

      it(`sends a ${noun} made on this seat to the server, and names it to peers only once it is there`, async () => {
        const made = file.create(contextOf(heldId));

        storage.add(made);

        expect(upload).toHaveBeenCalledWith(heldId, made.blob, uploadName, expect.objectContaining({ first: true }));
        expect(catalogued(heldId)).toBe(false);
        finishUpload('exists');
        await vi.waitFor(() => expect(catalogued(heldId)).toBe(true));
      });

      it(`sends every ${noun} held in full up to a room just entered, received ones too`, async () => {
        storage.add(contextOf(heldId));

        storage.uploadAllToAssetStore();

        expect(upload).toHaveBeenCalledTimes(1);
        expect(upload).toHaveBeenCalledWith(
          heldId,
          expect.any(Blob),
          uploadName,
          expect.objectContaining({ first: false })
        );
        finishUpload('exists');
        await vi.waitFor(() => expect(catalogued(heldId)).toBe(true));
      });

      it(`leaves a ${noun} received from a peer where it came from`, () => {
        storage.add(contextOf(heldId));

        expect(upload).not.toHaveBeenCalled();
        expect(catalogued(heldId)).toBe(true);
      });

      it('sends nothing while no server is configured', () => {
        store.configure(null);
        store.useAccess(null);

        storage.add(file.create(contextOf(heldId)));

        expect(upload).not.toHaveBeenCalled();
        expect(catalogued(heldId)).toBe(true);
      });

      it('sends neither a placeholder nor one not named by its hash', () => {
        storage.add(file.createEmpty('0'.repeat(64)));
        storage.add(file.create(contextOf('none_icon')));

        expect(upload).not.toHaveBeenCalled();
      });

      extra.assetServer?.(serverHarness);
    });

    extra.held?.(harness);
  });
}
