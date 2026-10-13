import { MusicBus } from '@axe/core/audio/music-bus';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';

type NodeMock = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn> };
  fftSize: number;
  smoothingTimeConstant: number;
  getFloatTimeDomainData: ReturnType<typeof vi.fn>;
};

function node(): NodeMock {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    getFloatTimeDomainData: vi.fn(),
  };
}

function contextMock(options: { analysers?: boolean } = {}) {
  return {
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => node()),
    createAnalyser: options.analysers === false ? undefined : vi.fn(() => node()),
  };
}

type PlayerStatics = { _audioContext: unknown; channels: Map<VolumeType, unknown> };

describe('MusicBus', () => {
  let context: ReturnType<typeof contextMock>;

  function useContext(made: ReturnType<typeof contextMock>): void {
    context = made;
    function AudioContextCtor() {
      return made;
    }
    vi.stubGlobal('AudioContext', AudioContextCtor);
    vi.stubGlobal('webkitAudioContext', AudioContextCtor);
    const statics = AudioPlayer as unknown as PlayerStatics;
    statics._audioContext = undefined;
    statics.channels.clear();
  }

  beforeEach(() => {
    MusicBus.forget();
    useContext(contextMock());
    MusicBus.installWhenReady();
  });

  afterEach(() => {
    MusicBus.forget();
    const statics = AudioPlayer as unknown as PlayerStatics;
    statics._audioContext = undefined;
    statics.channels.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('makes no audio context of its own', () => {
    expect(MusicBus.current).toBeNull();
    expect(context.createGain).not.toHaveBeenCalled();
  });

  it('sets itself into the music channel as soon as the page makes its audio context', () => {
    void AudioPlayer.audioContext;

    const bus = MusicBus.current!;
    expect(bus).not.toBeNull();
    expect(AudioPlayer.channelInput(VolumeType.MASTER)).toBe(bus.input);
    expect((bus.output as unknown as NodeMock).connect).toHaveBeenCalledWith(
      AudioPlayer.channelNode(VolumeType.MASTER)
    );
    expect(AudioPlayer.channelInput(VolumeType.SE)).toBe(AudioPlayer.channelNode(VolumeType.SE));
  });

  it('listens to what the effects and cut-ins sound like for the listener, after their own volumes', () => {
    void AudioPlayer.audioContext;

    for (const type of [VolumeType.SE, VolumeType.CUT_IN]) {
      const channel = AudioPlayer.channelNode(type) as unknown as NodeMock;
      expect(channel.connect).toHaveBeenCalledWith(expect.objectContaining({ fftSize: 512 }));
    }
  });

  it('ducks under effects only when asked, keeping the ask for a bus not built yet', () => {
    vi.useFakeTimers();
    MusicBus.setDucking(true);
    void AudioPlayer.audioContext;
    const effectsTap = (AudioPlayer.channelNode(VolumeType.SE) as unknown as NodeMock).connect.mock.calls
      .map(([to]) => to as NodeMock)
      .find((to) => to.fftSize === 512)!;
    effectsTap.getFloatTimeDomainData.mockImplementation((array: Float32Array) => array.fill(0.5));

    vi.advanceTimersByTime(100);

    expect(MusicBus.current!.ducking).toBeLessThan(1);

    MusicBus.setDucking(false);
    expect(MusicBus.current!.ducking).toBe(1);
  });

  it('eases the music to a ducked level once, however often asked', () => {
    void AudioPlayer.audioContext;
    const bus = MusicBus.current!;
    const duck = (bus.input as unknown as NodeMock).connect.mock.calls[0][0] as NodeMock;

    bus.duckTo(0.3, 0.05);
    bus.duckTo(0.3, 0.05);

    expect(duck.gain.setTargetAtTime).toHaveBeenCalledOnce();
    expect(duck.gain.setTargetAtTime).toHaveBeenCalledWith(0.3, 0, 0.05);
  });

  it('lets the music go straight to its volume where the bus cannot be built', () => {
    MusicBus.forget();
    useContext(contextMock({ analysers: false }));

    void AudioPlayer.audioContext;

    expect(MusicBus.current).toBeNull();
    expect(AudioPlayer.channelInput(VolumeType.MASTER)).toBe(AudioPlayer.channelNode(VolumeType.MASTER));
  });
});
