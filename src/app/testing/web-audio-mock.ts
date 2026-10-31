import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioOutput } from '@axe/core/storage/audio-output';

export type GainNodeMock = {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    setTargetAtTime: ReturnType<typeof vi.fn>;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

export type AudioBufferSourceNodeMock = {
  buffer: AudioBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  playbackRate: GainNodeMock['gain'];
};

export type AudioContextMock = ReturnType<typeof makeAudioContextMock>;

export type AudioElmMock = {
  volume: number;
  playbackRate?: number;
  preservesPitch?: boolean;
  loop: boolean;
  paused: boolean;
  currentTime: number;
  src: string;
  onpause: (() => void) | null;
  onended: (() => void) | null;
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

export function makeGainNode(): GainNodeMock {
  return {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

/** Where a source's sound goes once past the player's own fader and trim, which it always meets first. */
export function reachedPastTrim(source: { connect: ReturnType<typeof vi.fn> }): unknown {
  const fader = source.connect.mock.calls[0][0] as GainNodeMock;
  const trim = fader.connect.mock.calls[0][0] as GainNodeMock;
  return trim.connect.mock.calls[0][0];
}

function makeBufferSource(): AudioBufferSourceNodeMock {
  return {
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
    playbackRate: makeGainNode().gain,
  };
}

function makeAudioContextMock() {
  const destination = {} as AudioDestinationNode;
  return {
    currentTime: 0,
    destination,
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(() => makeGainNode()),
    createMediaElementSource: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => makeBufferSource()),
    decodeAudioData: vi.fn(
      (_buf: ArrayBuffer, resolve: (b: AudioBuffer) => void, _reject: (e: DOMException) => void) => {
        resolve({ duration: 1, length: 48000, numberOfChannels: 2 } as AudioBuffer);
      }
    ),
  };
}

function makeAudioElm(): AudioElmMock {
  return {
    volume: 1,
    loop: false,
    paused: true,
    currentTime: 0,
    src: '',
    onpause: null,
    onended: null,
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
}

/**
 * Forgets the page's audio context, what waits on one, and the channels, so that nothing leaks
 * between tests: ng test keeps the module across spec files in a worker, and a service built in
 * another file leaves what it waits on a context for, such as the music bus. The channels are
 * emptied rather than set, which would build the gain graph a test has yet to ask for.
 */
export function forgetAudioOutput(): void {
  const output = AudioOutput as unknown as {
    _context: unknown;
    contextListeners: unknown[];
    channels: Map<unknown, unknown>;
  };
  output._context = undefined;
  output.contextListeners.length = 0;
  output.channels.clear();
}

/**
 * Stands in for Web Audio, the audio element, fetch and object URLs, with a fresh audio output, and
 * gives back the stand-in context and the element every new `Audio` is. A sound fetched by its url
 * comes back empty, as a spec that cares about the bytes says what they are. Undone by
 * `vi.unstubAllGlobals()` and `vi.restoreAllMocks()`.
 */
export function installWebAudioMock(): { context: AudioContextMock; element: AudioElmMock } {
  const context = makeAudioContextMock();
  const element = makeAudioElm();
  // Plain functions, as an arrow cannot be constructed.
  function AudioContextCtor(this: unknown) {
    return context;
  }
  vi.stubGlobal('AudioContext', AudioContextCtor);
  vi.stubGlobal('webkitAudioContext', AudioContextCtor);
  function AudioCtor(this: unknown) {
    return element;
  }
  vi.stubGlobal('Audio', AudioCtor);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob()))
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  forgetAudioOutput();
  return { context, element };
}

/** An audio file with bytes, a url, or neither, under an identifier. */
export function audioFileWith(opts: { blob?: Blob | null; url?: string; identifier?: string } = {}): AudioFile {
  const identifier = opts.identifier ?? 'test-id';
  const audio = AudioFile.createEmpty(identifier);
  const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
  ctx['blob'] = opts.blob ?? null;
  ctx['url'] = opts.url ?? '';
  return audio;
}
