import { filterSetting, MusicBus } from '@axe/core/audio/music-bus';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';

type ParamMock = {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
};

type NodeMock = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  gain: ParamMock;
  frequency: ParamMock;
  Q: ParamMock;
  delayTime: ParamMock;
  type: string;
  buffer: unknown;
  fftSize: number;
  smoothingTimeConstant: number;
  getFloatTimeDomainData: ReturnType<typeof vi.fn>;
};

function param(): ParamMock {
  return { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() };
}

function node(): NodeMock {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: param(),
    frequency: param(),
    Q: param(),
    delayTime: param(),
    type: '',
    buffer: null,
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    getFloatTimeDomainData: vi.fn(),
  };
}

function contextMock(options: { analysers?: boolean } = {}) {
  return {
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    createGain: vi.fn(() => node()),
    createAnalyser: options.analysers === false ? undefined : vi.fn(() => node()),
    createBiquadFilter: vi.fn(() => node()),
    createDelay: vi.fn(() => node()),
    createConvolver: vi.fn(() => node()),
    createBuffer: vi.fn((channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (channel: number) => data[channel] };
    }),
  };
}

type PlayerStatics = { _audioContext: unknown; channels: Map<VolumeType, unknown> };

describe('filterSetting()', () => {
  it('opens both filters wide in the middle', () => {
    expect(filterSetting(0)).toEqual({ lowpassHz: 20000, highpassHz: 10, q: 0.707 });
  });

  it('cuts the treble down to 150 Hz turned left, evenly over the octaves', () => {
    expect(filterSetting(-1).lowpassHz).toBeCloseTo(150, 6);
    expect(filterSetting(-0.5).lowpassHz).toBeCloseTo(Math.sqrt(20000 * 150), 6);
    expect(filterSetting(-1).highpassHz).toBe(10);
  });

  it('cuts the bass up to 6 kHz turned right, sharper as it goes', () => {
    expect(filterSetting(1).highpassHz).toBeCloseTo(6000, 6);
    expect(filterSetting(1).lowpassHz).toBe(20000);
    expect(filterSetting(1).q).toBeGreaterThan(filterSetting(0.3).q);
  });
});

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
    const duck = (bus as unknown as { duck: NodeMock }).duck;

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

  describe('effects', () => {
    type Inside = { lowpass: NodeMock; highpass: NodeMock; echoSend: NodeMock; reverbSend: NodeMock };

    function inside(): Inside {
      return MusicBus.current as unknown as Inside;
    }

    it('lets the music through untouched until turned', () => {
      void AudioPlayer.audioContext;

      expect(inside().lowpass.frequency.setTargetAtTime).toHaveBeenLastCalledWith(20000, 0, expect.any(Number));
      expect(inside().highpass.frequency.setTargetAtTime).toHaveBeenLastCalledWith(10, 0, expect.any(Number));
      expect(context.createConvolver).not.toHaveBeenCalled();
      expect(MusicBus.current!.engaged).toEqual({ echo: false, reverb: false });
    });

    it('keeps effects asked for before the bus is built, and puts them on once it is', () => {
      MusicBus.setEffects({ filter: -1, echo: 0, echoDelayS: 0.4, reverb: 0 });
      void AudioPlayer.audioContext;

      expect(inside().lowpass.frequency.setTargetAtTime).toHaveBeenLastCalledWith(
        expect.closeTo(150, 6),
        0,
        expect.any(Number)
      );
    });

    it('puts the echo and the reverb on only while turned up, and takes them off once they have died away', () => {
      vi.useFakeTimers();
      void AudioPlayer.audioContext;

      MusicBus.setEffects({ filter: 0, echo: 0.5, echoDelayS: 0.36, reverb: 0.4 });
      expect(inside().lowpass.connect).toHaveBeenCalledWith(inside().echoSend);
      expect(inside().lowpass.connect).toHaveBeenCalledWith(inside().reverbSend);
      expect(context.createConvolver).toHaveBeenCalledOnce();
      expect(MusicBus.current!.engaged).toEqual({ echo: true, reverb: true });

      MusicBus.setEffects({ filter: 0, echo: 0, echoDelayS: 0.36, reverb: 0 });
      vi.advanceTimersByTime(3000);
      expect(MusicBus.current!.engaged).toEqual({ echo: true, reverb: true });

      vi.advanceTimersByTime(4000);
      expect(MusicBus.current!.engaged).toEqual({ echo: false, reverb: false });
      expect(inside().lowpass.disconnect).toHaveBeenCalledWith(inside().echoSend);

      MusicBus.setEffects({ filter: 0, echo: 0, echoDelayS: 0.36, reverb: 0.2 });
      expect(context.createConvolver).toHaveBeenCalledOnce();
    });
  });
});
