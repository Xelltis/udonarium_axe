import { DEFAULT_DUCKING, SidechainDucker, type SignalTap } from '@axe/core/audio/sidechain-ducker';
import type { Mock } from 'vitest';

/** A tap that hears a steady tone at the amplitude it is set to. */
function tap(): SignalTap & { amplitude: number } {
  return {
    amplitude: 0,
    fftSize: 64,
    getFloatTimeDomainData(array: Float32Array<ArrayBuffer>) {
      for (let i = 0; i < array.length; i++) array[i] = i % 2 === 0 ? this.amplitude : -this.amplitude;
    },
  };
}

describe('SidechainDucker', () => {
  let now: number;
  let target: { duckTo: Mock<(level: number, timeConstant: number) => void> };

  beforeEach(() => {
    now = 0;
    target = { duckTo: vi.fn<(level: number, timeConstant: number) => void>() };
  });

  function ducker(...taps: SignalTap[]): SidechainDucker {
    return new SidechainDucker(taps, target, DEFAULT_DUCKING, () => now);
  }

  it('ducks the music the moment another sound rises over the threshold, and only once', () => {
    const effects = tap();
    const ducking = ducker(effects);

    effects.amplitude = 0.5;
    ducking.listen();
    ducking.listen();

    expect(target.duckTo).toHaveBeenCalledOnce();
    expect(target.duckTo).toHaveBeenCalledWith(expect.closeTo(Math.pow(10, -9 / 20), 6), DEFAULT_DUCKING.attackS);
  });

  it('leaves the music alone under a sound quieter than the threshold', () => {
    const effects = tap();
    effects.amplitude = 0.001;

    ducker(effects).listen();

    expect(target.duckTo).not.toHaveBeenCalled();
  });

  it('brings the music back once every other sound has been quiet for a moment', () => {
    const effects = tap();
    const cutIns = tap();
    const ducking = ducker(effects, cutIns);
    cutIns.amplitude = 0.5;
    ducking.listen();

    cutIns.amplitude = 0;
    now = DEFAULT_DUCKING.holdMs - 1;
    ducking.listen();
    expect(target.duckTo).toHaveBeenCalledTimes(1);

    now = DEFAULT_DUCKING.holdMs;
    ducking.listen();
    expect(target.duckTo).toHaveBeenLastCalledWith(1, DEFAULT_DUCKING.releaseS);
  });

  it('listens a few dozen times a second while turned on, and brings the music back when turned off', () => {
    vi.useFakeTimers();
    try {
      const effects = tap();
      effects.amplitude = 0.5;
      const ducking = ducker(effects);

      ducking.setEnabled(true);
      vi.advanceTimersByTime(DEFAULT_DUCKING.pollMs);
      expect(ducking.isEnabled).toBe(true);
      expect(target.duckTo).toHaveBeenCalledOnce();

      ducking.setEnabled(false);
      expect(target.duckTo).toHaveBeenLastCalledWith(1, DEFAULT_DUCKING.releaseS);
      vi.advanceTimersByTime(DEFAULT_DUCKING.pollMs * 10);
      expect(target.duckTo).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
