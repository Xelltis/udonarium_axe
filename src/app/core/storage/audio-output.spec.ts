import { AudioOutput, type ChannelInsert, VolumeType } from '@axe/core/storage/audio-output';
import {
  type AudioContextMock,
  type GainNodeMock,
  installWebAudioMock,
  makeGainNode,
} from '@axe/testing/web-audio-mock';

describe('AudioOutput', () => {
  let audioCtxMock: AudioContextMock;

  beforeEach(() => {
    ({ context: audioCtxMock } = installWebAudioMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('VolumeType', () => {
    it('master is zero', () => {
      expect(VolumeType.MASTER).toBe(0);
    });
    it('audition is one', () => {
      expect(VolumeType.AUDITION).toBe(1);
    });
    it('the sound effects are two', () => {
      expect(VolumeType.SE).toBe(2);
    });
    it('the background sounds are three', () => {
      expect(VolumeType.BACKGROUND).toBe(3);
    });
    it('the kinds split off from the sound effects come after, in a fixed order', () => {
      expect([VolumeType.CUT_IN, VolumeType.NOTIFICATION, VolumeType.HANDLING, VolumeType.EFFECT]).toEqual([
        4, 5, 6, 7,
      ]);
    });
  });

  describe('the audio context', () => {
    it('builds the audio context on first use', () => {
      const ctx = AudioOutput.context;
      expect(ctx).toBe(audioCtxMock);
    });

    it('returns the same one afterwards', () => {
      const a = AudioOutput.context;
      const b = AudioOutput.context;
      expect(a).toBe(b);
    });

    it('tells what waits on it once it is made, and no longer once that stops waiting', () => {
      const kept = vi.fn();
      const dropped = vi.fn();
      AudioOutput.whenContextReady(kept);
      const stop = AudioOutput.whenContextReady(dropped);

      stop();
      const ctx = AudioOutput.context;

      expect(kept).toHaveBeenCalledWith(ctx);
      expect(dropped).not.toHaveBeenCalled();
    });

    it('falls back to the prefixed constructor', () => {
      vi.stubGlobal('AudioContext', undefined);
      const capturedCtx = audioCtxMock;
      let callCount = 0;
      function webkitCtor(this: unknown) {
        callCount++;
        return capturedCtx;
      }
      vi.stubGlobal('webkitAudioContext', webkitCtor);
      const ctx = AudioOutput.context;
      expect(ctx).toBe(audioCtxMock);
      expect(callCount).toBe(1);
    });
  });

  describe('channels', () => {
    const ALL = [
      VolumeType.MASTER,
      VolumeType.AUDITION,
      VolumeType.SE,
      VolumeType.BACKGROUND,
      VolumeType.CUT_IN,
      VolumeType.NOTIFICATION,
      VolumeType.HANDLING,
      VolumeType.EFFECT,
    ];

    it('gives every kind a channel of its own, running to the speakers', () => {
      const nodes = ALL.map((type) => AudioOutput.channelNode(type));

      expect(new Set(nodes).size).toBe(ALL.length);
      for (const node of nodes) {
        expect((node as unknown as GainNodeMock).connect).toHaveBeenCalledWith(audioCtxMock.destination);
      }
    });

    it('starts every channel at half', () => {
      expect(ALL.map((type) => AudioOutput.channelVolume(type))).toEqual(ALL.map(() => 0.5));
    });

    it('glides one channel to a new volume and leaves the others alone', () => {
      AudioOutput.setChannelVolume(VolumeType.HANDLING, 0.3);

      expect(AudioOutput.channelVolume(VolumeType.HANDLING)).toBe(0.3);
      expect(AudioOutput.channelVolume(VolumeType.SE)).toBe(0.5);
      const node = AudioOutput.channelNode(VolumeType.HANDLING) as unknown as GainNodeMock;
      expect(node.gain.setTargetAtTime).toHaveBeenCalledWith(0.3, 0, 0.01);
    });

    it('takes players straight to the volume while nothing is set between them', () => {
      expect(AudioOutput.channelInput(VolumeType.CUT_IN)).toBe(AudioOutput.channelNode(VolumeType.CUT_IN));
    });

    it('sets something between a channel’s players and its volume, and leaves the other channels', () => {
      const insert = { input: makeGainNode(), output: makeGainNode() };

      AudioOutput.setChannelInsert(VolumeType.MASTER, insert as unknown as ChannelInsert);

      expect(AudioOutput.channelInput(VolumeType.MASTER)).toBe(insert.input);
      expect(insert.output.connect).toHaveBeenCalledWith(AudioOutput.channelNode(VolumeType.MASTER));
      expect(AudioOutput.channelInput(VolumeType.SE)).toBe(AudioOutput.channelNode(VolumeType.SE));
    });

    it('is a channel of its own, apart from the music and the effects', () => {
      const node = AudioOutput.channelNode(VolumeType.BACKGROUND);
      expect(node).toBe(AudioOutput.channelNode(VolumeType.BACKGROUND));
      expect(node).not.toBe(AudioOutput.channelNode(VolumeType.MASTER));
      expect(node).not.toBe(AudioOutput.channelNode(VolumeType.SE));
    });
  });

  describe('resumeOnGesture()', () => {
    type ContextState = { state: string; addEventListener: ReturnType<typeof vi.fn> };

    function listenersOnDocument() {
      const listeners = new Map<string, EventListener>();
      const removed = new Set<string>();
      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
        listeners.set(type, listener as EventListener);
        removed.delete(type);
      });
      vi.spyOn(document, 'removeEventListener').mockImplementation((type) => {
        removed.add(type);
      });
      return { listeners, removed };
    }

    function contextIn(state: string): { context: ContextState; stopped: () => void } {
      const handlers: (() => void)[] = [];
      const context = Object.assign(audioCtxMock, {
        state,
        addEventListener: vi.fn((_type: string, handler: () => void) => handlers.push(handler)),
      }) as unknown as ContextState;
      return { context, stopped: () => handlers.forEach((handler) => handler()) };
    }

    async function settle(): Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
    }

    it('resumes the context when a finger lifts, not when it lands', () => {
      contextIn('suspended');
      const { listeners } = listenersOnDocument();

      AudioOutput.resumeOnGesture();

      expect(listeners.has('touchstart')).toBe(false);
      listeners.get('touchend')!(new Event('touchend'));
      expect(audioCtxMock.resume).toHaveBeenCalledTimes(1);
    });

    it('resumes it on a press or a key as well', () => {
      contextIn('suspended');
      const { listeners } = listenersOnDocument();

      AudioOutput.resumeOnGesture();
      listeners.get('mousedown')!(new Event('mousedown'));
      listeners.get('keydown')!(new Event('keydown'));

      expect(audioCtxMock.resume).toHaveBeenCalledTimes(2);
    });

    it('keeps listening until the context is running', async () => {
      const { context } = contextIn('suspended');
      const { listeners, removed } = listenersOnDocument();

      AudioOutput.resumeOnGesture();
      listeners.get('touchend')!(new Event('touchend'));
      await settle();
      expect(removed.size).toBe(0);

      context.state = 'running';
      listeners.get('touchend')!(new Event('touchend'));
      await settle();
      expect([...removed].sort()).toEqual(['keydown', 'mousedown', 'touchend']);
    });

    it('listens again once the context is stopped, as iOS does for a call or a hidden page', async () => {
      const { context, stopped } = contextIn('running');
      const { listeners, removed } = listenersOnDocument();

      AudioOutput.resumeOnGesture();
      listeners.get('touchend')!(new Event('touchend'));
      await settle();
      expect(removed.size).toBe(3);

      context.state = 'interrupted';
      stopped();

      expect(removed.size).toBe(0);
    });
  });
});
