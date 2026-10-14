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
    expect(Math.abs(estimate!.bar - 0.25)).toBeLessThan(0.01);
    expect(estimate!.confidence).toBeGreaterThan(0.5);
  });

  it('takes the beat rather than the eighth notes between beats', () => {
    const estimate = estimateTempo(drums({ bpm: 128, firstDownbeat: 1.1, seconds: 40, eighths: true }), RATE);

    expect(estimate!.bpm).toBeCloseTo(128, 1);
    const bar = (4 * 60) / 128;
    const error = Math.abs(((estimate!.bar - 1.1 + bar / 2) % bar) - bar / 2);
    expect(error).toBeLessThan(0.02);
  });

  it('takes a kick on every beat as the beat when a snare falls on every other one', () => {
    const random = seededRandom(4);
    const seconds = 30;
    const samples = new Float32Array(seconds * RATE);
    const period = 60 / 124;
    for (let beat = 0; 0.9 + beat * period < seconds - 1; beat++) {
      const from = Math.round((0.9 + beat * period) * RATE);
      for (let i = 0; i < 0.15 * RATE; i++) {
        const sweep = 50 + 70 * Math.exp(-i / (0.01 * RATE));
        samples[from + i] += 0.9 * Math.exp(-i / (0.05 * RATE)) * Math.sin((2 * Math.PI * sweep * i) / RATE);
      }
      if (beat % 2 === 1) {
        for (let i = 0; i < 0.12 * RATE; i++)
          samples[from + i] += 0.35 * Math.exp(-i / (0.03 * RATE)) * (random() * 2 - 1);
      }
    }

    expect(estimateTempo(samples, RATE)!.bpm).toBeCloseTo(124, 1);
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

  it('reads the beat through a dense mix whose noise rises all the time', () => {
    const random = seededRandom(11);
    const samples = new Float32Array(30 * RATE);
    let smoothed = 0;
    let chord = 1;
    const eighth = Math.round((RATE * 30) / 150);
    for (let i = 0; i < samples.length; i++) {
      if (i % eighth === 0) chord = 0.7 + 0.3 * random();
      smoothed = smoothed * 0.6 + (random() * 2 - 1) * 0.4;
      const note = Math.floor(i / eighth) % 4;
      samples[i] = 0.35 * chord * smoothed + 0.25 * Math.sin((2 * Math.PI * 55 * Math.pow(2, note / 12) * i) / RATE);
    }
    const kicks = drums({ bpm: 150, firstDownbeat: 0.2, seconds: 30 });
    for (let i = 0; i < samples.length; i++) samples[i] += kicks[i];

    const estimate = estimateTempo(samples, RATE);

    expect(estimate!.bpm).toBeCloseTo(150, 1);
    expect(estimate!.confidence).toBeGreaterThan(0.5);
  });

  it('is unsure of a vibrato, whose steady swell no beat stands out of', () => {
    const tone = new Float32Array(30 * RATE);
    for (let i = 0; i < tone.length; i++) {
      const t = i / RATE;
      const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t);
      tone[i] =
        0.05 *
        (Math.sin(2 * Math.PI * 196 * vibrato * t) +
          Math.sin(2 * Math.PI * 246.9 * vibrato * t) +
          0.5 * Math.sin(2 * Math.PI * 293.7 * t));
    }

    const estimate = estimateTempo(tone, RATE);

    expect(estimate === null || estimate.confidence < 0.3).toBe(true);
  });

  it('reads nothing from a held chord swelling slowly, whose partials only beat against each other', () => {
    const pad = new Float32Array(30 * RATE);
    for (let i = 0; i < pad.length; i++) {
      const t = i / RATE;
      const swell = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 15);
      pad[i] =
        0.02 *
        (0.4 + 0.6 * swell) *
        (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.18 * t) + Math.sin(2 * Math.PI * 329.63 * t));
    }

    expect(estimateTempo(pad, RATE)).toBeNull();
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
