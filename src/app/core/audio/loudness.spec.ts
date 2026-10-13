import { kWeightingFilters, measureLoudness } from '@axe/core/audio/loudness';

function sine(amplitude: number, frequency: number, seconds: number, sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++)
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  return samples;
}

describe('kWeightingFilters()', () => {
  it('matches the coefficients ITU-R BS.1770 lists for 48 kHz', () => {
    const [shelf, cut] = kWeightingFilters(48000);

    expect(shelf.b0).toBeCloseTo(1.53512485958697, 8);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 8);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 8);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 8);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 8);
    expect([cut.b0, cut.b1, cut.b2]).toEqual([1, -2, 1]);
    expect(cut.a1).toBeCloseTo(-1.99004745483398, 8);
    expect(cut.a2).toBeCloseTo(0.99007225036621, 8);
  });
});

describe('measureLoudness()', () => {
  it('reads a full-scale 1 kHz sine in both channels as about 0 LUFS', () => {
    const tone = sine(1, 997, 3, 48000);
    const measure = measureLoudness([tone, tone], 48000);

    expect(measure.integrated).toBeCloseTo(0, 1);
    expect(measure.peak).toBeCloseTo(0, 2);
  });

  it('reads the same sine in one channel 3 dB quieter', () => {
    const tone = sine(1, 997, 3, 48000);
    const measure = measureLoudness([tone, new Float32Array(tone.length)], 48000);

    expect(measure.integrated).toBeCloseTo(-3.01, 1);
  });

  it('follows the amplitude in decibels at the analysis rate', () => {
    const tone = sine(0.1, 997, 4, 22050);
    const measure = measureLoudness([tone, tone], 22050);

    expect(measure.integrated).toBeCloseTo(-20, 0);
    expect(measure.peak).toBeCloseTo(-20, 1);
  });

  it('leaves silence between loud passages out of the loudness', () => {
    const rate = 22050;
    const loud = sine(0.1, 997, 2, rate);
    const withGap = new Float32Array(loud.length * 3);
    withGap.set(loud, 0);
    withGap.set(loud, loud.length * 2);
    const measure = measureLoudness([withGap, withGap], rate);

    expect(measure.integrated).toBeCloseTo(-20, 0);
  });

  it('measures a sound shorter than one block as a whole', () => {
    const tone = sine(0.5, 997, 0.2, 22050);
    const measure = measureLoudness([tone, tone], 22050);

    expect(measure.integrated).not.toBeNull();
    expect(measure.integrated!).toBeCloseTo(20 * Math.log10(0.5), 0);
  });

  it('reads silence as having neither loudness nor peak', () => {
    const silent = new Float32Array(22050);

    expect(measureLoudness([silent, silent], 22050)).toEqual({ integrated: null, peak: null });
    expect(measureLoudness([], 22050)).toEqual({ integrated: null, peak: null });
  });
});
