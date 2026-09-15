import { Network } from '@axe/core/network/network';
import * as NetworkMessaging from '@axe/core/network/network-messaging';
import { AudioFile, AudioFileContext, AudioState } from '@axe/core/storage/audio-file';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';

// ─── helpers ─────────────────────────────────────────────────────────────────

const AudioStorageMock = AudioStorage.instance as unknown as {
  get: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  synchronize: ReturnType<typeof vi.fn>;
  getCatalog: ReturnType<typeof vi.fn>;
};
const BufferSharingTaskMock = BufferSharingTask as unknown as {
  createSendTask: ReturnType<typeof vi.fn>;
  createReceiveTask: ReturnType<typeof vi.fn>;
};

type AudioSharingSystemPrivateInstance = {
  cleanups: (() => void)[];
  sendTaskMap: Map<string, unknown>;
  receiveTaskMap: Map<string, unknown>;
  startSendTask: (audio: AudioFile, sendTo: string) => Promise<void>;
};

type AudioSharingSystemPrivateStatic = {
  _instance?: AudioSharingSystemPrivateInstance;
};

const audioSharingStatic = AudioSharingSystem as unknown as AudioSharingSystemPrivateStatic;
const asAudioSharingPrivate = (instance: AudioSharingSystem): AudioSharingSystemPrivateInstance =>
  instance as unknown as AudioSharingSystemPrivateInstance;

function makeAudioFile(
  opts: { blob?: Blob | null; url?: string; identifier?: string; state?: AudioState } = {}
): AudioFile {
  const id = opts.identifier ?? 'audio-id';
  const audio = AudioFile.createEmpty(id);
  const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
  ctx['blob'] = opts.blob ?? null;
  ctx['url'] = opts.url ?? '';
  return audio;
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
    identifier: overrides.identifier ?? 'audio-id',
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

describe('AudioSharingSystem', () => {
  let sendSpy: ReturnType<typeof vi.spyOn>;

  // The static peer accessors are overwritten with defineProperty.
  // Restoring the mocks does not undo that, so the original descriptors are kept and put
  // back afterwards, or these values would leak into the tests in other files.
  //
  const ORIGINAL_PEER_ID = Object.getOwnPropertyDescriptor(Network, 'peerId')!;
  const ORIGINAL_PEER_IDS = Object.getOwnPropertyDescriptor(Network, 'peerIds')!;

  beforeEach(() => {
    // clear the previous instance's subscription, since the real channel is in use
    audioSharingStatic._instance?.cleanups.forEach((c) => c());
    // reset the singleton
    audioSharingStatic._instance = undefined;

    vi.clearAllMocks();

    // the peer ids need a fresh copy each time, so they come from a getter
    Object.defineProperty(Network, 'peerIds', { get: () => ['self-peer', 'peer-a', 'peer-b'], configurable: true });
    Object.defineProperty(Network, 'peerId', { get: () => 'self-peer', configurable: true });

    // spy on send so nothing actually goes out
    sendSpy = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

    vi.spyOn(AudioStorage.instance, 'getCatalog').mockReturnValue([]);
    vi.spyOn(AudioStorage.instance, 'get').mockReturnValue(null!);
    vi.spyOn(AudioStorage.instance, 'add').mockReturnValue(undefined!);
    vi.spyOn(AudioStorage.instance, 'synchronize').mockReturnValue(undefined!);
    vi.spyOn(AudioStorage.instance, 'lazySynchronize').mockReturnValue(undefined!);
    vi.spyOn(BufferSharingTask, 'createSendTask').mockReturnValue(undefined!);
    vi.spyOn(BufferSharingTask, 'createReceiveTask').mockReturnValue(undefined!);
  });

  afterEach(() => {
    audioSharingStatic._instance?.cleanups.forEach((c) => c());
    vi.restoreAllMocks();
    Object.defineProperty(Network, 'peerId', ORIGINAL_PEER_ID);
    Object.defineProperty(Network, 'peerIds', ORIGINAL_PEER_IDS);
  });

  // --- the singleton ---

  describe('instance', () => {
    it('builds the instance on first use', () => {
      const a = AudioSharingSystem.instance;
      expect(a).toBeInstanceOf(AudioSharingSystem);
    });

    it('returns the same one afterwards', () => {
      const a = AudioSharingSystem.instance;
      const b = AudioSharingSystem.instance;
      expect(a).toBe(b);
    });
  });

  // ─── initialize ────────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('initialises cleanly', () => {
      expect(() => AudioSharingSystem.instance.initialize()).not.toThrow();
    });
  });

  // ─── CONNECT_PEER ──────────────────────────────────────────────────────────

  describe('on CONNECT_PEER', () => {
    beforeEach(() => AudioSharingSystem.instance.initialize());

    it('sends the catalogue to the peer that connected, since everyone else has had it already', () => {
      emit('CONNECT_PEER', { peerId: 'peer-a' }, { sendFrom: 'self-peer' });
      expect(AudioStorageMock.synchronize).toHaveBeenCalledWith('peer-a');
    });

    it('does nothing for a message from someone else', () => {
      emit('CONNECT_PEER', { peerId: 'peer-a' });
      expect(AudioStorageMock.synchronize).not.toHaveBeenCalled();
    });
  });

  // ─── SYNCHRONIZE_AUDIO_LIST ────────────────────────────────────────────────

  describe('on SYNCHRONIZE_AUDIO_LIST', () => {
    beforeEach(() => AudioSharingSystem.instance.initialize());

    it('does nothing for a message it sent itself', () => {
      emit('SYNCHRONIZE_AUDIO_LIST', [], { sendFrom: 'self-peer' });
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('adds an empty entry for audio it does not know', () => {
      AudioStorageMock.get.mockReturnValue(null);
      emit('SYNCHRONIZE_AUDIO_LIST', [{ identifier: 'new-audio', state: AudioState.COMPLETE }]);
      expect(AudioStorageMock.add).toHaveBeenCalled();
    });

    it('asks for audio it does not yet hold', () => {
      const audio = makeAudioFile({ identifier: 'partial-audio' });
      AudioStorageMock.get.mockReturnValue(audio);
      emit('SYNCHRONIZE_AUDIO_LIST', [{ identifier: 'partial-audio', state: audio.state }]);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_AUDIO_RESOURE',
          data: expect.objectContaining({ receiver: 'self-peer' }),
        }),
        'peer-a'
      );
    });

    it('asks first for the audio the room is playing', () => {
      AudioStorageMock.get.mockImplementation((id: string) => makeAudioFile({ identifier: id }));
      AudioSharingSystem.instance.preferredIdentifiers = () => ['playing-now'];
      vi.spyOn(Math, 'random').mockReturnValue(0);

      emit('SYNCHRONIZE_AUDIO_LIST', [
        { identifier: 'another-track', state: AudioState.COMPLETE },
        { identifier: 'playing-now', state: AudioState.COMPLETE },
      ]);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_AUDIO_RESOURE',
          data: expect.objectContaining({ identifiers: [expect.objectContaining({ identifier: 'playing-now' })] }),
        }),
        'peer-a'
      );
    });

    it('asks for nothing already being received', () => {
      const audio = makeAudioFile({ identifier: 'in-progress', url: 'http://a.mp3' });
      AudioStorageMock.get.mockReturnValue(audio);
      const task = makeTask({ identifier: 'in-progress' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);
      asAudioSharingPrivate(AudioSharingSystem.instance).receiveTaskMap.set('in-progress', task);
      emit('SYNCHRONIZE_AUDIO_LIST', [{ identifier: 'in-progress', state: audio.state }]);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('returns with nothing to ask for and no room to receive', () => {
      const audio = makeAudioFile({ identifier: 'done', blob: new Blob(['x']) });
      AudioStorageMock.get.mockReturnValue(audio);
      emit('SYNCHRONIZE_AUDIO_LIST', [{ identifier: 'done', state: AudioState.COMPLETE }]);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('synchronises on its own with nothing to ask for, nothing running and a short catalogue', () => {
      AudioStorageMock.get.mockReturnValue(null);
      AudioStorageMock.getCatalog.mockReturnValue([
        { identifier: 'local-only', state: AudioState.COMPLETE },
        { identifier: 'local-only2', state: AudioState.COMPLETE },
      ]);
      emit('SYNCHRONIZE_AUDIO_LIST', []);
      expect(AudioStorageMock.synchronize).toHaveBeenCalledWith('peer-a');
    });

    it('asks for nothing once the receive limit is reached', () => {
      const audio = makeAudioFile({ identifier: 'limit', url: 'http://a.mp3' });
      AudioStorageMock.get.mockImplementation((id: string) => {
        if (id === 'limit') return audio;
        return makeAudioFile({ identifier: id, url: 'http://a.mp3' });
      });
      const instance = AudioSharingSystem.instance;
      for (let i = 0; i < 4; i++) {
        asAudioSharingPrivate(instance).receiveTaskMap.set(`fill-${i}`, makeTask({ identifier: `fill-${i}` }));
      }
      emit('SYNCHRONIZE_AUDIO_LIST', [{ identifier: 'limit', state: AudioState.NULL }]);
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  // ─── REQUEST_AUDIO_RESOURE ─────────────────────────────────────────────────

  describe('on REQUEST_AUDIO_RESOURE', () => {
    beforeEach(() => AudioSharingSystem.instance.initialize());

    it('does nothing for a message it sent itself', () => {
      emit('REQUEST_AUDIO_RESOURE', { identifiers: [], receiver: 'p', candidatePeers: [] }, { sendFrom: 'self-peer' });
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('starts sending audio it can send', async () => {
      const audio = makeAudioFile({ identifier: 'send-audio', blob: new Blob(['x']) });
      AudioStorageMock.get.mockReturnValue(audio);
      const task = makeTask({ identifier: 'send-audio', sendTo: 'peer-a' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'send-audio', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-a'],
      });
      await vi.waitFor(() =>
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            eventName: 'START_AUDIO_TRANSMISSION',
            data: { fileIdentifier: 'send-audio' },
          }),
          'peer-r'
        )
      );
    });

    it('relays rather than sending again', () => {
      const audio = makeAudioFile({ identifier: 'exist-send', blob: new Blob(['x']) });
      AudioStorageMock.get.mockReturnValue(audio);
      const existingTask = makeTask({ identifier: 'exist-send', sendTo: 'peer-r' });
      asAudioSharingPrivate(AudioSharingSystem.instance).sendTaskMap.set('exist-send', existingTask);

      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'exist-send', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-a', 'peer-b'],
      });
      expect(sendSpy).toHaveBeenCalled();
    });

    it('relays with nothing to ask for', () => {
      AudioStorageMock.get.mockReturnValue(null);
      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'none', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-b'],
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_AUDIO_RESOURE',
          data: expect.objectContaining({ receiver: 'peer-r' }),
        }),
        'peer-b'
      );
    });

    it('takes itself out of the candidates and relays', () => {
      AudioStorageMock.get.mockReturnValue(null);
      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'none', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['self-peer', 'peer-b'],
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'REQUEST_AUDIO_RESOURE',
          data: expect.objectContaining({ receiver: 'peer-r' }),
        }),
        'peer-b'
      );
    });

    it('relays nothing with no candidates', () => {
      AudioStorageMock.get.mockReturnValue(null);
      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'none', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: [],
      });
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('relays once the send limit is reached', () => {
      const audio = makeAudioFile({ identifier: 'limited', blob: new Blob(['x']) });
      AudioStorageMock.get.mockReturnValue(audio);
      const instance = AudioSharingSystem.instance;
      for (let i = 0; i < 2; i++) {
        asAudioSharingPrivate(instance).sendTaskMap.set(
          `fill-${i}`,
          makeTask({ identifier: `fill-${i}`, sendTo: `peer-fill-${i}` })
        );
      }
      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'limited', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: ['peer-b'],
      });
      expect(BufferSharingTaskMock.createSendTask).not.toHaveBeenCalled();
    });
  });

  // ─── UPDATE_AUDIO_RESOURE ──────────────────────────────────────────────────

  describe('on UPDATE_AUDIO_RESOURE', () => {
    beforeEach(() => AudioSharingSystem.instance.initialize());

    it('adds it as bytes when there are bytes', () => {
      const fakeArrayBuffer = new Uint8Array([1, 2, 3]).buffer;
      emit('UPDATE_AUDIO_RESOURE', [
        { identifier: 'u1', blob: fakeArrayBuffer, type: 'audio/mpeg', name: 'test', url: '' },
      ]);
      expect(AudioStorageMock.add).toHaveBeenCalled();
      const addedArg = AudioStorageMock.add.mock.calls[0][0] as AudioFileContext;
      expect(addedArg.blob).toBeInstanceOf(Blob);
    });

    it('adds it as it is when there are none', () => {
      emit('UPDATE_AUDIO_RESOURE', [{ identifier: 'u2', blob: null, type: '', name: 'test', url: 'http://a.mp3' }]);
      expect(AudioStorageMock.add).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'u2', blob: null }));
    });
  });

  // ─── START_AUDIO_TRANSMISSION ──────────────────────────────────────────────

  describe('on START_AUDIO_TRANSMISSION', () => {
    beforeEach(() => AudioSharingSystem.instance.initialize());

    it('cancels when it is already receiving that one', () => {
      const instance = AudioSharingSystem.instance;
      asAudioSharingPrivate(instance).receiveTaskMap.set('cancel-id', makeTask({ identifier: 'cancel-id' }));
      emit('START_AUDIO_TRANSMISSION', { fileIdentifier: 'cancel-id' });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'CANCEL_TASK_cancel-id', data: null }),
        'peer-a'
      );
    });

    it('cancels when it already holds the audio', () => {
      const audio = makeAudioFile({ identifier: 'complete-id', blob: new Blob(['x']) });
      AudioStorageMock.get.mockReturnValue(audio);
      emit('START_AUDIO_TRANSMISSION', { fileIdentifier: 'complete-id' });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'CANCEL_TASK_complete-id', data: null }),
        'peer-a'
      );
    });

    it('starts receiving otherwise', () => {
      AudioStorageMock.get.mockReturnValue(null);
      const task = makeTask({ identifier: 'recv-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);
      emit('START_AUDIO_TRANSMISSION', { fileIdentifier: 'recv-id' });
      expect(BufferSharingTaskMock.createReceiveTask).toHaveBeenCalledWith('recv-id');
    });
  });

  // --- sending what it holds in full ---

  describe('startSendTask (via REQUEST_AUDIO_RESOURE)', () => {
    beforeEach(() => AudioSharingSystem.instance.initialize());

    it('sends the url for audio it holds only by url', async () => {
      const audio = makeAudioFile({ identifier: 'url-audio', url: 'http://example.com/a.mp3' });
      AudioStorageMock.get.mockReturnValue(audio);
      const task = makeTask({ identifier: 'url-audio', sendTo: 'peer-r' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'url-audio', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: [],
      });

      await vi.waitFor(() => expect(task.start).toHaveBeenCalled());
      const sentContext = (task.start as ReturnType<typeof vi.fn>).mock.calls[0][0] as AudioFileContext;
      expect(sentContext.url).toBe('http://example.com/a.mp3');
    });

    it('drops the task and synchronises when sending finishes', async () => {
      const audio = makeAudioFile({ identifier: 'finish-audio', blob: new Blob(['x']) });
      AudioStorageMock.get.mockReturnValue(audio);
      const task = makeTask({ identifier: 'finish-audio', sendTo: 'peer-r' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      emit('REQUEST_AUDIO_RESOURE', {
        identifiers: [{ identifier: 'finish-audio', state: AudioState.NULL }],
        receiver: 'peer-r',
        candidatePeers: [],
      });

      await vi.waitFor(() => expect(task.start).toHaveBeenCalled());
      (task as unknown as { onfinish: () => void }).onfinish();
      expect(asAudioSharingPrivate(AudioSharingSystem.instance).sendTaskMap.has('finish-audio')).toBe(false);
      expect(AudioStorageMock.synchronize).toHaveBeenCalledWith('peer-r');
      expect(vi.mocked(AudioStorage.instance.lazySynchronize)).toHaveBeenCalledWith(1000);
    });

    it('survives being asked to send audio that is neither', async () => {
      const audio = makeAudioFile({ identifier: 'broken-send' });
      const task = makeTask({ identifier: 'broken-send', sendTo: 'peer-r' });
      BufferSharingTaskMock.createSendTask.mockReturnValue(task);

      await expect(
        asAudioSharingPrivate(AudioSharingSystem.instance).startSendTask(audio, 'peer-r')
      ).resolves.toBeUndefined();
      expect(task.start).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'broken-send', blob: null, type: '', url: '' })
      );
    });
  });

  // ─── startReceiveTask / onprogress / onfinish ─────────────────────────────

  describe('startReceiveTask (via START_AUDIO_TRANSMISSION)', () => {
    beforeEach(() => AudioSharingSystem.instance.initialize());

    it('applies each chunk as it arrives', () => {
      const audio = makeAudioFile({ identifier: 'prog-id' });
      AudioStorageMock.get.mockReturnValue(audio);
      const task = makeTask({ identifier: 'prog-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);
      const applySpy = vi.spyOn(audio, 'apply');

      emit('START_AUDIO_TRANSMISSION', { fileIdentifier: 'prog-id' });

      const onprogress = (
        task as unknown as {
          onprogress: (t: unknown, loaded: number, total: number) => void;
        }
      ).onprogress;
      onprogress(task, 50, 100);
      expect(applySpy).toHaveBeenCalled();
    });

    it('drops the task and synchronises when receiving finishes', () => {
      const audio = makeAudioFile({ identifier: 'fin-id' });
      AudioStorageMock.get.mockReturnValue(audio);
      const task = makeTask({ identifier: 'fin-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);

      emit('START_AUDIO_TRANSMISSION', { fileIdentifier: 'fin-id' });

      const onfinish = (
        task as unknown as {
          onfinish: (t: unknown, data: AudioFileContext | null) => void;
        }
      ).onfinish;
      const fakeContext: AudioFileContext = { identifier: 'fin-id', name: 'fin', blob: null, type: '', url: '' };
      onfinish(task, fakeContext);

      expect(asAudioSharingPrivate(AudioSharingSystem.instance).receiveTaskMap.has('fin-id')).toBe(false);
      // the dispatch announces the audio and it is added
      expect(AudioStorageMock.add).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'fin-id' }));
      expect(vi.mocked(AudioStorage.instance.lazySynchronize)).toHaveBeenCalledWith(1000);
    });

    it('announces nothing when the task finishes empty-handed', () => {
      const audio = makeAudioFile({ identifier: 'nil-id' });
      AudioStorageMock.get.mockReturnValue(audio);
      const task = makeTask({ identifier: 'nil-id' });
      BufferSharingTaskMock.createReceiveTask.mockReturnValue(task);

      emit('START_AUDIO_TRANSMISSION', { fileIdentifier: 'nil-id' });

      const onfinish = (
        task as unknown as {
          onfinish: (t: unknown, data: AudioFileContext | null) => void;
        }
      ).onfinish;
      AudioStorageMock.add.mockClear();
      onfinish(task, null);
      // nothing is announced, so nothing is added
      expect(AudioStorageMock.add).not.toHaveBeenCalled();
    });
  });
});
