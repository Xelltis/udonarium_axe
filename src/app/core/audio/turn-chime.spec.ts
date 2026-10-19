import { playChime, scheduleChime, TURN_SE_SIGNAL, TURN_SE_TICK } from '@axe/core/audio/turn-chime';

/** An audio parameter that only remembers what it was set to. */
function param() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

/** Enough of an audio context to schedule a chime on, counting what it was asked to make. */
function fakeContext(state: AudioContextState = 'running') {
  const made = { oscillators: 0, gains: [] as { gain: ReturnType<typeof param> }[], outputs: [] as unknown[] };
  const node = () => ({ connect: vi.fn((to: unknown) => made.outputs.push(to)) });
  const context = {
    state,
    currentTime: 2,
    sampleRate: 8000,
    destination: { name: 'speakers' },
    resume: vi.fn(() => Promise.resolve()),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    }),
    createGain: () => {
      const gain = { ...node(), gain: param() };
      made.gains.push(gain);
      return gain;
    },
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createConvolver: () => ({ ...node(), buffer: null }),
    createBufferSource: () => ({ ...node(), buffer: null, start: vi.fn(), stop: vi.fn() }),
    createOscillator: () => {
      made.oscillators++;
      return { ...node(), type: '', frequency: param(), start: vi.fn(), stop: vi.fn() };
    },
  };
  return { context: context as unknown as AudioContext, made, raw: context };
}

describe('the chimes made for a turn', () => {
  it('lasts as long as its longest partial and its reverb, for the signal', () => {
    const { context, made } = fakeContext();

    const seconds = scheduleChime(context, context.destination, 0, TURN_SE_SIGNAL, { volume: 1 });

    expect(seconds).toBeCloseTo(0.085 + 0.004 + 0.5 + 0.05 + 1.4);
    expect(made.oscillators).toBe(6);
  });

  it('lasts as long as its longest partial and its reverb, for the tick', () => {
    const { context, made } = fakeContext();

    const seconds = scheduleChime(context, context.destination, 0, TURN_SE_TICK, { volume: 1 });

    expect(seconds).toBeCloseTo(0.004 + 0.09 + 0.05 + 1.4);
    expect(made.oscillators).toBe(2);
  });

  it('plays into the output it is given, at its volume times the chime’s own gain', () => {
    const { context, made } = fakeContext();
    const channel = { name: 'notices' } as unknown as AudioNode;

    playChime(context, TURN_SE_TICK, channel, 0.8);

    expect(made.outputs).toContain(channel);
    expect(made.outputs).not.toContain(context.destination);
    expect(made.gains.some((gain) => Math.abs(gain.gain.value - 0.8 * 0.9) < 1e-9)).toBe(true);
  });

  it('wakes a context the browser holds suspended', () => {
    const { context, raw } = fakeContext('suspended');

    playChime(context, TURN_SE_SIGNAL);

    expect(raw.resume).toHaveBeenCalled();
  });
});
