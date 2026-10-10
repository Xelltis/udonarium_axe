import { LoopPointTrack } from '@axe/core/storage/loop-point-track';

type FakeSource = {
  buffer: AudioBuffer | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

describe('LoopPointTrack', () => {
  let clock: { currentTime: number };
  let sources: FakeSource[];
  let gainValue: number;
  let context: BaseAudioContext;
  const buffer = { duration: 10 } as AudioBuffer;
  const region = { start: 2, end: 6 };
  const output = {} as AudioNode;

  const source = () => sources.at(-1)!;

  function track(loop = true): LoopPointTrack {
    return new LoopPointTrack(context, buffer, region, output, 0.8, loop);
  }

  beforeEach(() => {
    clock = { currentTime: 100 };
    sources = [];
    gainValue = 0;
    const param = {
      get value() {
        return gainValue;
      },
      setValueAtTime: vi.fn((value: number) => (gainValue = value)),
      linearRampToValueAtTime: vi.fn((value: number) => (gainValue = value)),
      cancelScheduledValues: vi.fn(),
    };
    context = {
      get currentTime() {
        return clock.currentTime;
      },
      createGain: () => ({ gain: param, connect: vi.fn(), disconnect: vi.fn() }),
      createBufferSource: () => {
        const made: FakeSource = {
          buffer: null,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          onended: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        sources.push(made);
        return made;
      },
    } as unknown as BaseAudioContext;
  });

  it('plays the track from memory, going round between its loop points', () => {
    track().start(1);

    expect(source()).toMatchObject({ buffer, loop: true, loopStart: 2, loopEnd: 6 });
    expect(source().start).toHaveBeenCalledWith(0, 1);
  });

  it('counts where it has got to by the audio clock, folded back into the loop once it has gone round', () => {
    const playing = track();
    playing.start(1);

    clock.currentTime += 3;
    expect(playing.position).toBeCloseTo(4);
    clock.currentTime += 3;
    expect(playing.position).toBeCloseTo(3);
  });

  it('plays on past the loop to the end of the track while it is not looping', () => {
    const playing = track(false);
    playing.start(1);

    clock.currentTime += 7;

    expect(source().loop).toBe(false);
    expect(playing.position).toBeCloseTo(8);
  });

  it('starts inside the loop when asked to start past its end', () => {
    track().start(7);

    expect(source().start).toHaveBeenCalledWith(0, 3);
  });

  it('turns looping on and off as it plays, keeping its place', () => {
    const playing = track(false);
    playing.start(4);
    clock.currentTime += 1;

    playing.loop = true;

    expect(source().loop).toBe(true);
    expect(playing.position).toBeCloseTo(5);
    clock.currentTime += 2;
    expect(playing.position).toBeCloseTo(3);
  });

  it('keeps its place when paused, and moves it while stopped', () => {
    const playing = track();
    playing.start(1);
    clock.currentTime += 2;

    playing.pause();
    clock.currentTime += 5;
    expect(playing.isPlaying).toBe(false);
    expect(playing.position).toBeCloseTo(3);

    playing.seek(4.5);
    expect(playing.position).toBeCloseTo(4.5);
    expect(sources).toHaveLength(1);
  });

  it('moves to a point at once while playing', () => {
    const playing = track();
    playing.start(1);

    playing.seek(5);

    expect(sources).toHaveLength(2);
    expect(sources[0].stop).toHaveBeenCalled();
    expect(source().start).toHaveBeenCalledWith(0, 5);
  });

  it('says so when it plays to its end, but not when it is stopped', () => {
    const playing = track(false);
    const ended = vi.fn();
    playing.onEnded = ended;
    playing.start(0);

    playing.seek(3);
    expect(sources[0].onended).toBeNull();

    source().onended!();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(playing.isPlaying).toBe(false);
  });

  it('fades on the audio clock, and resolves a fade cut short by another', async () => {
    const playing = track();
    playing.start(0);

    const first = playing.fadeTo(0, 10_000);
    const second = playing.fadeTo(1, 1);

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(playing.volume).toBe(1);
  });
});
