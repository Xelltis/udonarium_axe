import { Network } from '@axe/core/network/network';
import * as NetworkMessaging from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { ASSET_RETRY_DELAY_MS, ASSET_RETRY_LIMIT } from '@axe/core/storage/asset-retries';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import { ModelFile, ModelFileContext, ModelState } from '@axe/core/storage/model-file';
import { ModelSharingSystem } from '@axe/core/storage/model-sharing-system';
import { ModelStorage } from '@axe/core/storage/model-storage';
import type { MockInstance } from 'vitest';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ModelStorageMock = ModelStorage.instance as unknown as {
  get: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  synchronize: ReturnType<typeof vi.fn>;
  getCatalog: ReturnType<typeof vi.fn>;
};
const BufferSharingTaskMock = BufferSharingTask as unknown as {
  createSendTask: ReturnType<typeof vi.fn>;
  createReceiveTask: ReturnType<typeof vi.fn>;
};

type ModelSharingSystemPrivateInstance = {
  cleanups: (() => void)[];
  sendTaskMap: Map<string, unknown>;
  receiveTaskMap: Map<string, unknown>;
  startSendTask: (model: ModelFile, sendTo: string) => Promise<void>;
};

type ModelSharingSystemPrivateStatic = {
  _instance?: ModelSharingSystemPrivateInstance;
};

const modelSharingStatic = ModelSharingSystem as unknown as ModelSharingSystemPrivateStatic;
const asModelSharingPrivate = (instance: ModelSharingSystem): ModelSharingSystemPrivateInstance =>
  instance as unknown as ModelSharingSystemPrivateInstance;

function makeModelFile(
  opts: { blob?: Blob | null; url?: string; identifier?: string; state?: ModelState } = {}
): ModelFile {
  const id = opts.identifier ?? 'model-id';
  const model = ModelFile.createEmpty(id);
  const ctx = (model as unknown as { context: Record<string, unknown> }).context;
  ctx['blob'] = opts.blob ?? null;
  ctx['url'] = opts.url ?? '';
  return model;
}

function makeTask(
  overrides: Partial<{
    identifier: string;
    sendTo: string;
    start: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    onprogress: unknown;
    onfinish: unknown;
  }> = {}
) {
  return {
    identifier: overrides.identifier ?? 'model-id',
    sendTo: overrides.sendTo ?? 'peer-a',
    start: overrides.start ?? vi.fn(),
    cancel: overrides.cancel ?? vi.fn(),
    onprogress: undefined as unknown,
    onfinish: undefined as unknown,
  };
}

// puts a message onto the channel, through the local dispatch
function emit(eventName: string, data: unknown, opts: { sendFrom?: string } = {}) {
  NetworkMessaging.localDispatch(eventName, data, opts.sendFrom ?? 'peer-a');
}

// --- the tests ---

describe('ModelSharingSystem', () => {
  let sendSpy: ReturnType<typeof vi.spyOn>;

  // The static peer accessors are overwritten with defineProperty.
  // Restoring the mocks does not undo that, so the original descriptors are kept and put
  // back afterwards, or these values would leak into the tests in other files.
  //
  const ORIGINAL_PEER_ID = Object.getOwnPropertyDescriptor(Network, 'peerId')!;
  const ORIGINAL_PEER_IDS = Object.getOwnPropertyDescriptor(Network, 'peerIds')!;

  beforeEach(() => {
    // clear the previous instance's subscription, since the real channel is in use
    modelSharingStatic._instance?.cleanups.forEach((c) => c());
    // reset the singleton
    modelSharingStatic._instance = undefined;

    vi.clearAllMocks();

    // the peer ids need a fresh copy each time, so they come from a getter
    Object.defineProperty(Network, 'peerIds', { get: () => ['self-peer', 'peer-a', 'peer-b'], configurable: true });
    Object.defineProperty(Network, 'peerId', { get: () => 'self-peer', configurable: true });

    // spy on send so nothing actually goes out
    sendSpy = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

    vi.spyOn(ModelStorage.instance, 'getCatalog').mockReturnValue([]);
    vi.spyOn(ModelStorage.instance, 'get').mockReturnValue(null!);
    vi.spyOn(ModelStorage.instance, 'add').mockReturnValue(undefined!);
    vi.spyOn(ModelStorage.instance, 'synchronize').mockReturnValue(undefined!);
    vi.spyOn(ModelStorage.instance, 'lazySynchronize').mockReturnValue(undefined!);
    vi.spyOn(BufferSharingTask, 'createSendTask').mockReturnValue(undefined!);
    vi.spyOn(BufferSharingTask, 'createReceiveTask').mockReturnValue(undefined!);
  });

  afterEach(() => {
    modelSharingStatic._instance?.cleanups.forEach((c) => c());
    vi.restoreAllMocks();
    Object.defineProperty(Network, 'peerId', ORIGINAL_PEER_ID);
    Object.defineProperty(Network, 'peerIds', ORIGINAL_PEER_IDS);
  });

  // --- the singleton ---

  describe('instance', () => {
    it('builds the instance on first use', () => {
      const a = ModelSharingSystem.instance;
      expect(a).toBeInstanceOf(ModelSharingSystem);
    });

    it('returns the same one afterwards', () => {
      const a = ModelSharingSystem.instance;
      const b = ModelSharingSystem.instance;
      expect(a).toBe(b);
    });
  });

  // ─── initialize ────────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('initialises cleanly', () => {
      expect(() => ModelSharingSystem.instance.initialize()).not.toThrow();
    });
  });

  // ─── CONNECT_PEER ──────────────────────────────────────────────────────────

  describe('on CONNECT_PEER', () => {
    beforeEach(() => ModelSharingSystem.instance.initialize());

    it('sends the catalogue to the peer that connected, since everyone else has had it already', () => {
      emit('CONNECT_PEER', { peerId: 'peer-a' }, { sendFrom: 'self-peer' });
      expect(ModelStorageMock.synchronize).toHaveBeenCalledWith('peer-a');
    });

    it('does nothing for a message from someone else', () => {
      emit('CONNECT_PEER', { peerId: 'peer-a' });
      expect(ModelStorageMock.synchronize).not.toHaveBeenCalled();
    });
  });

  // ─── SYNCHRONIZE_MODEL_LIST ────────────────────────────────────────────────

  describe('on SYNCHRONIZE_MODEL_LIST', () => {
    beforeEach(() => ModelSharingSystem.instance.initialize());

    it('does nothing for a message it sent itself', () => {
      emit('SYNCHRONIZE_MODEL_LIST', [], { sendFrom: 'self-peer' });
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('adds an empty entry for model it does not know', () => {
      ModelStorageMock.get.mockReturnValue(null);
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: 'new-model', state: ModelState.COMPLETE }]);
      expect(ModelStorageMock.add).toHaveBeenCalled();
    });

    it('names every other peer to pass its request on to, though the list of peers leaves this seat out', () => {
      Object.defineProperty(Network, 'peerIds', { get: () => ['peer-a', 'peer-b'], configurable: true });
      const model = makeModelFile({ identifier: 'partial-model' });
      ModelStorageMock.get.mockReturnValue(model);

      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: 'partial-model', state: model.state }]);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_MODEL_RESOURE',
          data: expect.objectContaining({ candidatePeers: ['peer-a', 'peer-b'] }),
        }),
        'peer-a'
      );
    });

    it('asks for model it does not yet hold', () => {
      const model = makeModelFile({ identifier: 'partial-model' });
      ModelStorageMock.get.mockReturnValue(model);
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: 'partial-model', state: model.state }]);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_MODEL_RESOURE',
          data: expect.objectContaining({ receiver: 'self-peer' }),
        }),
        'peer-a'
      );
    });

    it('asks first for the model the room is playing', () => {
      ModelStorageMock.get.mockImplementation((id: string) => makeModelFile({ identifier: id }));
      ModelSharingSystem.instance.preferredIdentifiers = () => ['playing-now'];
      vi.spyOn(Math, 'random').mockReturnValue(0);

      emit('SYNCHRONIZE_MODEL_LIST', [
        { identifier: 'another-track', state: ModelState.COMPLETE },
        { identifier: 'playing-now', state: ModelState.COMPLETE },
      ]);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_MODEL_RESOURE',
          data: expect.objectContaining({ identifiers: [expect.objectContaining({ identifier: 'playing-now' })] }),
        }),
        'peer-a'
      );
    });

    it('asks for nothing already being received', () => {
      const model = makeModelFile({ identifier: 'in-progress', url: 'http://a.mp3' });
      ModelStorageMock.get.mockReturnValue(model);
      const task = makeTask({ identifier: 'in-progress' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);
      asModelSharingPrivate(ModelSharingSystem.instance).receiveTaskMap.set('in-progress', task);
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: 'in-progress', state: model.state }]);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('returns with nothing to ask for and no room to receive', () => {
      const model = makeModelFile({ identifier: 'done', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: 'done', state: ModelState.COMPLETE }]);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('synchronises on its own with nothing to ask for, nothing running and a short catalogue', () => {
      ModelStorageMock.get.mockReturnValue(null);
      ModelStorageMock.getCatalog.mockReturnValue([
        { identifier: 'local-only', state: ModelState.COMPLETE },
        { identifier: 'local-only2', state: ModelState.COMPLETE },
      ]);
      emit('SYNCHRONIZE_MODEL_LIST', []);
      expect(ModelStorageMock.synchronize).toHaveBeenCalledWith('peer-a');
    });

    it('asks for nothing once the receive limit is reached', () => {
      const model = makeModelFile({ identifier: 'limit', url: 'http://a.mp3' });
      ModelStorageMock.get.mockImplementation((id: string) => {
        if (id === 'limit') return model;
        return makeModelFile({ identifier: id, url: 'http://a.mp3' });
      });
      const instance = ModelSharingSystem.instance;
      for (let i = 0; i < 4; i++) {
        asModelSharingPrivate(instance).receiveTaskMap.set(`fill-${i}`, makeTask({ identifier: `fill-${i}` }));
      }
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: 'limit', state: ModelState.NULL }]);
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  // ─── the asset server ──────────────────────────────────────────────────────

  describe('fetching from the asset server', () => {
    const store = AssetHttpStore.instance;
    const trackId = 'd'.repeat(64);
    const fetchedBlob = new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], { type: 'model/ogg' });
    let download: MockInstance<AssetHttpStore['download']>;

    const requestsSent = () =>
      vi
        .mocked(Network.instance.send)
        .mock.calls.map(([context, sendTo]) => ({ ...(context as { eventName: string; data: unknown }), sendTo }))
        .filter((context) => context.eventName === 'REQUEST_MODEL_RESOURE');

    beforeEach(() => {
      store.configure('https://rooms.example');
      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      download = vi.spyOn(store, 'download').mockResolvedValue({ blob: fetchedBlob, name: '' });
      ModelStorageMock.get.mockImplementation((id: string) => makeModelFile({ identifier: id }));
      ModelSharingSystem.instance.initialize();
    });

    afterEach(() => {
      ModelSharingSystem.instance.forgetMisses();
      store.configure(null);
      store.useAccess(null);
      vi.useRealTimers();
    });

    it('takes model it lacks from the server, without asking a peer', async () => {
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }]);

      await vi.waitFor(() =>
        expect(ModelStorageMock.add).toHaveBeenCalledWith(
          expect.objectContaining({ identifier: trackId, type: 'model/ogg', blob: expect.any(Blob) })
        )
      );
      expect(download).toHaveBeenCalledWith(trackId, { first: false });
      expect(requestsSent()).toEqual([]);
    });

    it('names a model with no name by the one it was put up under, and keeps one it has', async () => {
      download.mockResolvedValue({ blob: fetchedBlob, name: 'theme.ogg' });
      ModelStorageMock.get.mockImplementation((id: string) =>
        id === trackId ? ModelFile.createEmpty(id) : ModelFile.createEmpty(id, 'kept.ogg')
      );
      const otherId = 'e'.repeat(64);

      emit('SYNCHRONIZE_MODEL_LIST', [
        { identifier: trackId, state: ModelState.COMPLETE },
        { identifier: otherId, state: ModelState.COMPLETE },
      ]);

      await vi.waitFor(() => expect(ModelStorageMock.add).toHaveBeenCalledTimes(2));
      expect(ModelStorageMock.add).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: trackId, name: 'theme.ogg' })
      );
      expect(ModelStorageMock.add).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: otherId, name: 'kept.ogg' })
      );
    });

    it('asks the peer that named the model when the server does not have it', async () => {
      download.mockResolvedValue('missing');

      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });

      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));
      expect(requestsSent()[0]).toMatchObject({
        sendTo: 'peer-b',
        data: { identifiers: [{ identifier: trackId, state: ModelState.NULL }] },
      });
    });

    describe('a model the room removed', () => {
      beforeEach(() => ModelStorage.instance.markRemoved(trackId));
      afterEach(() => ModelStorage.instance.unmarkRemoved(trackId));

      it('is taken from neither the server nor the peer whose catalogue names it', async () => {
        emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ModelStorageMock.add).not.toHaveBeenCalled();
        expect(download).not.toHaveBeenCalled();
        expect(requestsSent()).toEqual([]);
      });

      it('is taken neither from the room’s list nor as sent', () => {
        ModelSharingSystem.instance.fetchListed([{ id: trackId, name: 'theme.ogg' }]);
        emit('UPDATE_MODEL_RESOURE', [{ identifier: trackId, name: '', type: 'model/ogg', blob: null, url: '' }], {
          sendFrom: 'peer-b',
        });

        expect(ModelStorageMock.add).not.toHaveBeenCalled();
        expect(download).not.toHaveBeenCalled();
      });

      it('calls off its sending', () => {
        emit('START_MODEL_TRANSMISSION', { fileIdentifier: trackId }, { sendFrom: 'peer-b' });

        expect(
          vi.mocked(Network.instance.send).mock.calls.map(([context]) => (context as { eventName: string }).eventName)
        ).toContain(`CANCEL_TASK_${trackId}`);
      });
    });

    it('keeps no empty entry for a model the operator took down', async () => {
      download.mockResolvedValue('blocked');
      const dropped = vi.spyOn(ModelStorage.instance, 'delete');

      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });
      await vi.waitFor(() => expect(dropped).toHaveBeenCalledWith(trackId));
    });

    it('asks no peer, then or for a later catalogue, for a model the operator took down', async () => {
      download.mockResolvedValue('blocked');
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });
      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));

      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-c' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(download).toHaveBeenCalledTimes(1);
      expect(requestsSent()).toEqual([]);
    });

    it('puts a model the server lacked up once a peer has sent it, and no other', async () => {
      const upload = vi.spyOn(ModelStorage.instance, 'uploadReceived').mockImplementation(() => {});
      download.mockResolvedValue('missing');
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });
      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));
      const sent = (identifier: string) => ({ identifier, name: '', type: 'model/ogg', blob: null, url: '' });

      emit('UPDATE_MODEL_RESOURE', [sent(trackId), sent('e'.repeat(64))], { sendFrom: 'peer-b' });

      expect(upload.mock.calls).toEqual([[trackId]]);
    });

    it('takes a model the room lists, keeping the name it was listed under', async () => {
      ModelStorageMock.get.mockImplementation((id: string) => ModelFile.createEmpty(id, 'theme.ogg'));

      ModelSharingSystem.instance.fetchListed([{ id: trackId, name: 'theme.ogg' }]);

      await vi.waitFor(() =>
        expect(ModelStorageMock.add).toHaveBeenCalledWith(
          expect.objectContaining({ identifier: trackId, name: 'theme.ogg', blob: expect.any(Blob) })
        )
      );
    });

    it('makes a place for a listed model it has never heard of', () => {
      ModelStorageMock.get.mockReturnValue(null);

      ModelSharingSystem.instance.fetchListed([{ id: trackId, name: 'theme.ogg' }]);

      expect(ModelStorageMock.add).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: trackId, name: 'theme.ogg' })
      );
      expect(download).toHaveBeenCalledWith(trackId, { first: false });
    });

    it('asks the peer for model the server could not send just then, and the server again for the next catalogue', async () => {
      download.mockResolvedValue('failed');
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });
      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));

      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });

      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    });

    it('asks a peer whose catalogue named a listed model while the server was failing to send it', async () => {
      let fail: () => void = () => undefined;
      download.mockReturnValue(new Promise((resolve) => (fail = () => resolve('failed'))));
      ModelSharingSystem.instance.fetchListed([{ id: trackId, name: '' }]);
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }], { sendFrom: 'peer-b' });
      expect(requestsSent()).toEqual([]);

      fail();

      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));
      expect(requestsSent()[0]).toMatchObject({ sendTo: 'peer-b' });
    });

    it('tries a listed model the server could not send again a few times, and asks no peer for it', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      download.mockResolvedValue('failed');
      ModelSharingSystem.instance.fetchListed([{ id: trackId, name: '' }]);
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * (2 ** ASSET_RETRY_LIMIT - 1));
      expect(download).toHaveBeenCalledTimes(ASSET_RETRY_LIMIT + 1);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2 ** ASSET_RETRY_LIMIT);
      expect(download).toHaveBeenCalledTimes(ASSET_RETRY_LIMIT + 1);
      expect(requestsSent()).toEqual([]);
    });

    it('asks no peer for a listed model the server lacks, and tries the server again in another room', async () => {
      download.mockResolvedValue('missing');
      ModelSharingSystem.instance.fetchListed([{ id: trackId, name: '' }]);
      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requestsSent()).toEqual([]);

      ModelSharingSystem.instance.fetchListed([{ id: trackId, name: '' }]);
      expect(download).toHaveBeenCalledTimes(1);
      ModelSharingSystem.instance.forgetMisses();
      ModelSharingSystem.instance.fetchListed([{ id: trackId, name: '' }]);
      expect(download).toHaveBeenCalledTimes(2);
    });

    it('fetches what the room is playing before the rest', () => {
      const otherId = 'e'.repeat(64);
      ModelSharingSystem.instance.preferredIdentifiers = () => [trackId];

      emit('SYNCHRONIZE_MODEL_LIST', [
        { identifier: otherId, state: ModelState.COMPLETE },
        { identifier: trackId, state: ModelState.COMPLETE },
      ]);

      expect(download.mock.calls.map(([id]) => id)).toEqual([trackId, otherId]);
    });

    it('puts what the room is playing ahead of the pictures and models waiting, from the room list too', () => {
      const otherId = 'e'.repeat(64);
      const putFirst = vi.spyOn(store, 'downloadFirst');
      ModelSharingSystem.instance.fetchListed([
        { id: otherId, name: '' },
        { id: trackId, name: '' },
      ]);
      expect(download.mock.calls).toEqual([
        [otherId, { first: false }],
        [trackId, { first: false }],
      ]);

      ModelSharingSystem.instance.preferredIdentifiers = () => [trackId];
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: trackId, state: ModelState.COMPLETE }]);
      expect(putFirst).toHaveBeenCalledWith(trackId);

      ModelSharingSystem.instance.forgetMisses();
      const listedLater = 'f'.repeat(64);
      ModelSharingSystem.instance.preferredIdentifiers = () => [listedLater];
      ModelSharingSystem.instance.fetchListed([{ id: listedLater, name: '' }]);
      expect(download).toHaveBeenLastCalledWith(listedLater, { first: true });
    });

    it('moves music started since to the front of the downloads still waiting, and nothing else', () => {
      const otherId = 'e'.repeat(64);
      const putFirst = vi.spyOn(store, 'downloadFirst');
      download.mockReturnValue(new Promise(() => {}));
      ModelSharingSystem.instance.fetchListed([
        { id: otherId, name: '' },
        { id: trackId, name: '' },
      ]);

      const upFirst = vi.spyOn(store, 'uploadFirst');
      ModelSharingSystem.instance.preferredIdentifiers = () => [trackId, 'f'.repeat(64)];
      ModelSharingSystem.instance.preferWaiting();

      expect(putFirst.mock.calls).toEqual([[trackId]]);
      // Waiting to go up, the playing music is moved ahead too.
      expect(upFirst.mock.calls).toEqual([[trackId], ['f'.repeat(64)]]);
    });

    it('asks peers for model not named by its hash', () => {
      emit('SYNCHRONIZE_MODEL_LIST', [{ identifier: 'assets/sounds/bell.mp3', state: ModelState.COMPLETE }]);

      expect(download).not.toHaveBeenCalled();
      expect(requestsSent()).toHaveLength(1);
    });
  });

  // ─── REQUEST_MODEL_RESOURE ─────────────────────────────────────────────────

  describe('on REQUEST_MODEL_RESOURE', () => {
    beforeEach(() => ModelSharingSystem.instance.initialize());

    it('does nothing for a message it sent itself', () => {
      emit('REQUEST_MODEL_RESOURE', { identifiers: [], receiver: 'p', candidatePeers: [] }, { sendFrom: 'self-peer' });
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('starts sending model it can send', async () => {
      const model = makeModelFile({ identifier: 'send-model', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      const task = makeTask({ identifier: 'send-model', sendTo: 'peer-a' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'send-model', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-a'],
      });
      await vi.waitFor(() =>
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            eventName: 'START_MODEL_TRANSMISSION',
            data: { fileIdentifier: 'send-model' },
          }),
          'peer-r'
        )
      );
    });

    it('sends none this seat holds back for the room server’s operator, and relays the request', () => {
      const model = makeModelFile({ identifier: 'held-model', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      vi.spyOn(ModelStorage.instance, 'isHeldBack').mockReturnValue(true);

      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'held-model', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-b'],
      });

      expect(BufferSharingTaskMock.createSendTask).not.toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'REQUEST_MODEL_RESOURE' }), 'peer-b');
    });

    it('sends one it is sending to another peer to nobody else meanwhile, and relays the request', () => {
      const model = makeModelFile({ identifier: 'busy', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      asModelSharingPrivate(ModelSharingSystem.instance).sendTaskMap.set(
        'busy',
        makeTask({ identifier: 'busy', sendTo: 'peer-a' })
      );

      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'busy', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-b'],
      });

      expect(BufferSharingTaskMock.createSendTask).not.toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'REQUEST_MODEL_RESOURE' }), 'peer-b');
    });

    it('relays rather than sending again', () => {
      const model = makeModelFile({ identifier: 'exist-send', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      const existingTask = makeTask({ identifier: 'exist-send', sendTo: 'peer-r' });
      asModelSharingPrivate(ModelSharingSystem.instance).sendTaskMap.set('exist-send', existingTask);

      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'exist-send', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-a', 'peer-b'],
      });
      expect(sendSpy).toHaveBeenCalled();
    });

    it('relays with nothing to ask for', () => {
      ModelStorageMock.get.mockReturnValue(null);
      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'none', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-b'],
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_MODEL_RESOURE',
          data: expect.objectContaining({ receiver: 'peer-r' }),
        }),
        'peer-b'
      );
    });

    it('takes itself out of the candidates and relays', () => {
      ModelStorageMock.get.mockReturnValue(null);
      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'none', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['self-peer', 'peer-b'],
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_MODEL_RESOURE',
          data: expect.objectContaining({ receiver: 'peer-r' }),
        }),
        'peer-b'
      );
    });

    it('relays nothing with no candidates', () => {
      ModelStorageMock.get.mockReturnValue(null);
      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'none', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: [],
      });
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('relays once the send limit is reached', () => {
      const model = makeModelFile({ identifier: 'limited', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      const instance = ModelSharingSystem.instance;
      for (let i = 0; i < 2; i++) {
        asModelSharingPrivate(instance).sendTaskMap.set(
          `fill-${i}`,
          makeTask({ identifier: `fill-${i}`, sendTo: `peer-fill-${i}` })
        );
      }
      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'limited', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-b'],
      });
      expect(BufferSharingTaskMock.createSendTask).not.toHaveBeenCalled();
    });
  });

  // ─── UPDATE_MODEL_RESOURE ──────────────────────────────────────────────────

  describe('on UPDATE_MODEL_RESOURE', () => {
    beforeEach(() => ModelSharingSystem.instance.initialize());

    it('adds it as bytes when there are bytes', () => {
      const fakeArrayBuffer = new Uint8Array([1, 2, 3]).buffer;
      emit('UPDATE_MODEL_RESOURE', [
        { identifier: 'u1', blob: fakeArrayBuffer, type: 'model/mpeg', name: 'test', url: '' },
      ]);
      expect(ModelStorageMock.add).toHaveBeenCalled();
      const addedArg = ModelStorageMock.add.mock.calls[0][0] as ModelFileContext;
      expect(addedArg.blob).toBeInstanceOf(Blob);
    });

    it('adds it as it is when there are none', () => {
      emit('UPDATE_MODEL_RESOURE', [{ identifier: 'u2', blob: null, type: '', name: 'test', url: 'http://a.mp3' }]);
      expect(ModelStorageMock.add).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'u2', blob: null }));
    });
  });

  // ─── START_MODEL_TRANSMISSION ──────────────────────────────────────────────

  describe('on START_MODEL_TRANSMISSION', () => {
    beforeEach(() => ModelSharingSystem.instance.initialize());

    it('cancels when it is already receiving that one', () => {
      const instance = ModelSharingSystem.instance;
      asModelSharingPrivate(instance).receiveTaskMap.set('cancel-id', makeTask({ identifier: 'cancel-id' }));
      emit('START_MODEL_TRANSMISSION', { fileIdentifier: 'cancel-id' });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'CANCEL_TASK_cancel-id', data: null }),
        'peer-a'
      );
    });

    it('cancels when it already holds the model', () => {
      const model = makeModelFile({ identifier: 'complete-id', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      emit('START_MODEL_TRANSMISSION', { fileIdentifier: 'complete-id' });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'CANCEL_TASK_complete-id', data: null }),
        'peer-a'
      );
    });

    it('starts receiving otherwise', () => {
      ModelStorageMock.get.mockReturnValue(null);
      const task = makeTask({ identifier: 'recv-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);
      emit('START_MODEL_TRANSMISSION', { fileIdentifier: 'recv-id' });
      expect(BufferSharingTaskMock.createReceiveTask).toHaveBeenCalledWith('recv-id');
    });
  });

  // --- sending what it holds in full ---

  describe('startSendTask (via REQUEST_MODEL_RESOURE)', () => {
    it('calls a transfer off, telling the peer, where the bytes cannot be read', async () => {
      const model = makeModelFile({ identifier: 'unreadable', blob: {} as Blob });
      const task = makeTask({ identifier: 'unreadable', sendTo: 'peer-r' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      await asModelSharingPrivate(ModelSharingSystem.instance).startSendTask(model, 'peer-r');

      expect(task.cancel).toHaveBeenCalled();
      expect(task.start).not.toHaveBeenCalled();
      expect(asModelSharingPrivate(ModelSharingSystem.instance).sendTaskMap.has('unreadable')).toBe(false);
    });

    beforeEach(() => ModelSharingSystem.instance.initialize());

    it('drops the task and synchronises when sending finishes', async () => {
      const model = makeModelFile({ identifier: 'finish-model', blob: new Blob(['x']) });
      ModelStorageMock.get.mockReturnValue(model);
      const task = makeTask({ identifier: 'finish-model', sendTo: 'peer-r' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      emit('REQUEST_MODEL_RESOURE', {
        identifiers: [{ identifier: 'finish-model', state: ModelState.NULL }],
        receiver: 'peer-r',
        candidatePeers: [],
      });

      await vi.waitFor(() => expect(task.start).toHaveBeenCalled());
      (task as unknown as { onfinish: () => void }).onfinish();
      expect(asModelSharingPrivate(ModelSharingSystem.instance).sendTaskMap.has('finish-model')).toBe(false);
      expect(ModelStorageMock.synchronize).toHaveBeenCalledWith('peer-r');
      expect(vi.mocked(ModelStorage.instance.lazySynchronize)).toHaveBeenCalledWith(1000);
    });

    it('survives being asked to send model that is neither', async () => {
      const model = makeModelFile({ identifier: 'broken-send' });
      const task = makeTask({ identifier: 'broken-send', sendTo: 'peer-r' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      await expect(
        asModelSharingPrivate(ModelSharingSystem.instance).startSendTask(model, 'peer-r')
      ).resolves.toBeUndefined();
      expect(task.start).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'broken-send', blob: null, type: '', url: '' })
      );
    });
  });

  // ─── startReceiveTask / onprogress / onfinish ─────────────────────────────

  describe('startReceiveTask (via START_MODEL_TRANSMISSION)', () => {
    beforeEach(() => ModelSharingSystem.instance.initialize());

    it('applies each chunk as it arrives', () => {
      const model = makeModelFile({ identifier: 'prog-id' });
      ModelStorageMock.get.mockReturnValue(model);
      const task = makeTask({ identifier: 'prog-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);
      const applySpy = vi.spyOn(model, 'apply');

      emit('START_MODEL_TRANSMISSION', { fileIdentifier: 'prog-id' });

      const onprogress = (
        task as unknown as {
          onprogress: (t: unknown, loaded: number, total: number) => void;
        }
      ).onprogress;
      onprogress(task, 50, 100);
      expect(applySpy).toHaveBeenCalled();
    });

    it('drops the task and synchronises when receiving finishes', () => {
      const model = makeModelFile({ identifier: 'fin-id' });
      ModelStorageMock.get.mockReturnValue(model);
      const task = makeTask({ identifier: 'fin-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);

      emit('START_MODEL_TRANSMISSION', { fileIdentifier: 'fin-id' });

      const onfinish = (
        task as unknown as {
          onfinish: (t: unknown, data: ModelFileContext | null) => void;
        }
      ).onfinish;
      const fakeContext: ModelFileContext = { identifier: 'fin-id', name: 'fin', blob: null, type: '', url: '' };
      onfinish(task, fakeContext);

      expect(asModelSharingPrivate(ModelSharingSystem.instance).receiveTaskMap.has('fin-id')).toBe(false);
      // the dispatch announces the model and it is added
      expect(ModelStorageMock.add).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'fin-id' }));
      expect(vi.mocked(ModelStorage.instance.lazySynchronize)).toHaveBeenCalledWith(1000);
    });

    it('announces nothing when the task finishes empty-handed', () => {
      const model = makeModelFile({ identifier: 'nil-id' });
      ModelStorageMock.get.mockReturnValue(model);
      const task = makeTask({ identifier: 'nil-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);

      emit('START_MODEL_TRANSMISSION', { fileIdentifier: 'nil-id' });

      const onfinish = (
        task as unknown as {
          onfinish: (t: unknown, data: ModelFileContext | null) => void;
        }
      ).onfinish;
      ModelStorageMock.add.mockClear();
      onfinish(task, null);
      // nothing is announced, so nothing is added
      expect(ModelStorageMock.add).not.toHaveBeenCalled();
    });
  });
});
