/** The coefficients of one second-order filter, normalised so the first feedback term is 1. */
export interface Biquad {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

/** How loud a sound is as a whole and how high its loudest sample reaches. */
export interface LoudnessMeasure {
  /** The integrated loudness in LUFS, or null for a sound with nothing above the absolute gate. */
  readonly integrated: number | null;
  /** The loudest sample, in dB below full scale, or null for a sound that is silent throughout. */
  readonly peak: number | null;
}

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
const BLOCK_STEPS = 4;
const STEP_S = 0.1;

/**
 * The two filters of the K-weighting that loudness is measured through, worked out for any sample
 * rate: a shelf lifting the treble as the head does, then a cut of the deep bass.
 *
 * The analogue prototypes are those of ITU-R BS.1770, brought to the rate by the bilinear
 * transform, so at 48 kHz they match the coefficients the recommendation lists.
 */
export function kWeightingFilters(sampleRate: number): readonly [Biquad, Biquad] {
  const shelfFrequency = 1681.974450955533;
  const shelfGain = 3.999843853973347;
  const shelfQ = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * shelfFrequency) / sampleRate);
  const vh = Math.pow(10, shelfGain / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0Shelf = 1 + k1 / shelfQ + k1 * k1;
  const shelf: Biquad = {
    b0: (vh + (vb * k1) / shelfQ + k1 * k1) / a0Shelf,
    b1: (2 * (k1 * k1 - vh)) / a0Shelf,
    b2: (vh - (vb * k1) / shelfQ + k1 * k1) / a0Shelf,
    a1: (2 * (k1 * k1 - 1)) / a0Shelf,
    a2: (1 - k1 / shelfQ + k1 * k1) / a0Shelf,
  };

  const cutFrequency = 38.13547087602444;
  const cutQ = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * cutFrequency) / sampleRate);
  const a0Cut = 1 + k2 / cutQ + k2 * k2;
  const cut: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k2 * k2 - 1)) / a0Cut,
    a2: (1 - k2 / cutQ + k2 * k2) / a0Cut,
  };
  return [shelf, cut];
}

/**
 * Measures a sound's integrated loudness after ITU-R BS.1770 and its sample peak.
 *
 * Each channel is K-weighted and counted with the same weight, as the front left and right are.
 * The loudness is taken over 400 ms blocks overlapping by three quarters, leaving out the blocks
 * quieter than -70 LUFS and then those more than 10 LU below the loudness of the rest. A sound
 * shorter than one block is measured as a single block.
 */
export function measureLoudness(channels: readonly Float32Array[], sampleRate: number): LoudnessMeasure {
  const length = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0);
  if (length === 0 || !(sampleRate > 0)) return { integrated: null, peak: null };

  const stepLength = Math.max(1, Math.round(sampleRate * STEP_S));
  const stepCount = Math.floor(length / stepLength);
  const stepEnergy = new Float64Array(Math.max(1, stepCount));
  let wholeEnergy = 0;
  let peak = 0;
  const [shelf, cut] = kWeightingFilters(sampleRate);

  for (const samples of channels) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const magnitude = x < 0 ? -x : x;
      if (magnitude > peak) peak = magnitude;
      const y = shelf.b0 * x + shelf.b1 * x1 + shelf.b2 * x2 - shelf.a1 * y1 - shelf.a2 * y2;
      x2 = x1;
      x1 = x;
      const z = cut.b0 * y + cut.b1 * y1 + cut.b2 * y2 - cut.a1 * z1 - cut.a2 * z2;
      y2 = y1;
      y1 = y;
      z2 = z1;
      z1 = z;
      const energy = z * z;
      wholeEnergy += energy;
      const step = Math.floor(i / stepLength);
      if (step < stepCount) stepEnergy[step] += energy;
    }
  }

  const peakDb = peak > 0 ? 20 * Math.log10(peak) : null;
  if (stepCount < BLOCK_STEPS) {
    return { integrated: gatedLoudness([wholeEnergy / length]), peak: peakDb };
  }
  const blockLength = stepLength * BLOCK_STEPS;
  const blocks: number[] = [];
  for (let first = 0; first + BLOCK_STEPS <= stepCount; first++) {
    let energy = 0;
    for (let step = first; step < first + BLOCK_STEPS; step++) energy += stepEnergy[step];
    blocks.push(energy / blockLength);
  }
  return { integrated: gatedLoudness(blocks), peak: peakDb };
}

function loudnessOf(meanSquare: number): number {
  return -0.691 + 10 * Math.log10(meanSquare);
}

function gatedLoudness(blocks: readonly number[]): number | null {
  const audible = blocks.filter((block) => block > 0 && loudnessOf(block) > ABSOLUTE_GATE_LUFS);
  if (audible.length === 0) return null;
  const relativeGate = loudnessOf(mean(audible)) + RELATIVE_GATE_LU;
  const kept = audible.filter((block) => loudnessOf(block) > relativeGate);
  return loudnessOf(mean(kept.length > 0 ? kept : audible));
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}
