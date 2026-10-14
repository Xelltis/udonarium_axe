/** Where a sound begins and ends once the silence around it is left out, in seconds. */
export interface SoundSpan {
  readonly start: number;
  readonly end: number;
}

const WINDOW_S = 0.01;
const SILENCE_DB = -60;

/**
 * Where a sound first and last rises above silence, in seconds from its start.
 *
 * The sound is read in 10 ms windows, and a window counts as silent while the strength of every
 * channel in it stays under -60 dB below full scale, which is quieter than the tail of a fade but
 * louder than the hiss left after one. A sound silent throughout begins and ends at 0.
 */
export function findSoundSpan(channels: readonly Float32Array[], sampleRate: number): SoundSpan {
  const length = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0);
  if (length === 0 || !(sampleRate > 0)) return { start: 0, end: 0 };
  const windowLength = Math.max(1, Math.round(sampleRate * WINDOW_S));
  const windowCount = Math.ceil(length / windowLength);
  const threshold = Math.pow(10, SILENCE_DB / 20);
  const thresholdEnergy = threshold * threshold;

  const isAudible = (window: number): boolean => {
    const from = window * windowLength;
    const to = Math.min(length, from + windowLength);
    for (const samples of channels) {
      let energy = 0;
      const end = Math.min(to, samples.length);
      for (let i = from; i < end; i++) energy += samples[i] * samples[i];
      if (end > from && energy / (end - from) > thresholdEnergy) return true;
    }
    return false;
  };

  let first = 0;
  while (first < windowCount && !isAudible(first)) first++;
  if (first === windowCount) return { start: 0, end: 0 };
  let last = windowCount - 1;
  while (last > first && !isAudible(last)) last--;
  return {
    start: (first * windowLength) / sampleRate,
    end: Math.min(length, (last + 1) * windowLength) / sampleRate,
  };
}
