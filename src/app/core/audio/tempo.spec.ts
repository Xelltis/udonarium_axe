import { estimateTempo } from '@axe/core/audio/tempo';
import { seededRandom } from '@axe/core/util/seeded-random';

const RATE = 22050;

interface Pattern {
  bpm: number;
  firstDownbeat: number;
  seconds: number;
  eighths?: boolean;
}

/** A drum pattern: a click on every beat, a bass thump on each bar's first beat, and soft eighths between when asked. */
function drums({ bpm, firstDownbeat, seconds, eighths = false }: Pattern): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE));
  const random = seededRandom(7);
  const period = 60 / bpm;
  const addClick = (at: number, amplitude: number, length: number) => {
    const from = Math.round(at * RATE);
    for (let i = 0; i < length && from + i < samples.length; i++) {
      if (from + i < 0) continue;
      samples[from + i] += amplitude * (random() * 2 - 1) * Math.exp(-i / (length / 5));
    }
  };
  const addThump = (at: number) => {
    const from = Math.round(at * RATE);
    const length = Math.round(0.12 * RATE);
    for (let i = 0; i < length && from + i < samples.length; i++) {
      if (from + i < 0) continue;
      samples[from + i] += 0.8 * Math.sin((2 * Math.PI * 55 * i) / RATE) * Math.exp(-i / (length / 4));
    }
  };
  const firstBeat = firstDownbeat - Math.floor(firstDownbeat / period) * period;
  for (let beat = 0, at = firstBeat; at < seconds; beat++, at = firstBeat + beat * period) {
    const index = Math.round((at - firstDownbeat) / period);
    addClick(at, 0.6, 400);
    if (((index % 4) + 4) % 4 === 0) addThump(at);
    if (eighths) addClick(at + period / 2, 0.2, 200);
  }
  return samples;
}

function noise(seconds: number): Float32Array {
  const random = seededRandom(3);
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * (random() * 2 - 1);
  return samples;
}

describe('estimateTempo()', () => {
  it('reads the tempo and the first bar of a steady beat', () => {
    const estimate = estimateTempo(drums({ bpm: 120, firstDownbeat: 0.25, seconds: 30 }), RATE);

    expect(estimate).not.toBeNull();
    expect(estimate!.bpm).toBeCloseTo(120, 1);
    expect(estimate!.bar).toBeCloseTo(0.25, 1);
    expect(Math.abs(estimate!.bar - 0.25)).toBeLessThan(0.02);
    expect(estimate!.confidence).toBeGreaterThan(0.5);
  });

  it('takes the beat rather than the eighth notes between beats', () => {
    const estimate = estimateTempo(drums({ bpm: 128, firstDownbeat: 1.1, seconds: 40, eighths: true }), RATE);

    expect(estimate!.bpm).toBeCloseTo(128, 1);
    const bar = (4 * 60) / 128;
    const error = Math.abs(((estimate!.bar - 1.1 + bar / 2) % bar) - bar / 2);
    expect(error).toBeLessThan(0.02);
  });

  it('reads a slower tempo that is not a whole number', () => {
    const estimate = estimateTempo(drums({ bpm: 92.5, firstDownbeat: 0.6, seconds: 40 }), RATE);

    expect(Math.abs(estimate!.bpm - 92.5)).toBeLessThan(0.1);
  });

  it('is unsure of noise with no beat in it', () => {
    const estimate = estimateTempo(noise(20), RATE);

    expect(estimate === null || estimate.confidence < 0.3).toBe(true);
  });

  it('is unsure of chords that come at no steady pace', () => {
    const random = seededRandom(5);
    const samples = new Float32Array(30 * RATE);
    for (let at = 0; at < 30; at += 0.3 + random() * 1.5) {
      const frequency = 110 * Math.pow(2, Math.floor(random() * 24) / 12);
      const from = Math.round(at * RATE);
      for (let i = 0; i < RATE * 1.2 && from + i < samples.length; i++) {
        samples[from + i] += 0.25 * Math.sin((2 * Math.PI * frequency * i) / RATE) * Math.exp(-i / (RATE * 0.5));
      }
    }

    expect(estimateTempo(samples, RATE)!.confidence).toBeLessThan(0.3);
  });

  it('reads nothing from a held tone, where nothing starts', () => {
    const tone = new Float32Array(20 * RATE);
    for (let i = 0; i < tone.length; i++) {
      tone[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE + 3 * Math.sin((2 * Math.PI * 0.3 * i) / RATE));
    }

    expect(estimateTempo(tone, RATE)).toBeNull();
  });

  it('reads nothing from a sound under six seconds or from silence', () => {
    expect(estimateTempo(drums({ bpm: 120, firstDownbeat: 0, seconds: 4 }), RATE)).toBeNull();
    expect(estimateTempo(new Float32Array(RATE * 10), RATE)).toBeNull();
  });
});
