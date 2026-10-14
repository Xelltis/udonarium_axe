import { Fft } from '@axe/core/audio/fft';

/** The beat a piece of music keeps, as read from the sound. */
export interface TempoEstimate {
  /** Beats per minute. */
  readonly bpm: number;
  /** When the first bar's first beat falls, in seconds, from 0 up to the length of one bar of four beats. */
  readonly bar: number;
  /** How sure the reading is, from 0 for no beat to be heard to 1 for a click track. */
  readonly confidence: number;
}

/** How strongly each moment of a sound starts something new, sampled evenly. */
export interface OnsetEnvelope {
  /** The strength of what starts in each frame, over every frequency. */
  readonly strength: Float32Array;
  /** The strength of what starts in each frame in the bass alone, where the bar's first beat tends to land. */
  readonly bass: Float32Array;
  /** Frames per second. */
  readonly rate: number;
  /** The time in seconds that frame 0 stands for. */
  readonly start: number;
  /** How much rises from frame to frame against how much is sounding, on average: near 0 for a held tone. */
  readonly liveliness: number;
}

const TARGET_RATE = 11025;
const FRAME = 1024;
/**
 * Where in a frame an onset shows as the strongest rise, as a share of the frame from its start: a
 * sound entering the window rises most while it is still in the window's later part.
 */
const ONSET_LAG = 0.75;
const HOP = 128;
const BASS_HZ = 150;
const MIN_BPM = 60;
const MAX_BPM = 200;
const PRIOR_BPM = 120;
const PRIOR_OCTAVES = 1;
const MIN_SECONDS = 6;
const BEATS_PER_BAR = 4;
const CONFIDENCE_SCALE = 2.5;
const MIN_LIVELINESS = 0.015;
const UNACCENTED_DOUBT = 0.2;
const OFFBEAT_SHARE = 0.6;

/**
 * Reads how strongly something starts at each moment of a sound: the rise in each frequency's
 * strength from one short frame to the next, summed. A drum hit or a new chord rises sharply; a
 * held note does not.
 *
 * The sound is first brought down to about 11 kHz, which keeps what beats are heard by.
 */
export function onsetEnvelope(mono: Float32Array, sampleRate: number): OnsetEnvelope {
  const factor = Math.max(1, Math.floor(sampleRate / TARGET_RATE));
  const rate = sampleRate / factor;
  const length = Math.floor(mono.length / factor);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += mono[i * factor + j];
    samples[i] = sum / factor;
  }

  const frameCount = length >= FRAME ? Math.floor((length - FRAME) / HOP) + 1 : 0;
  const strength = new Float32Array(frameCount);
  const bass = new Float32Array(frameCount);
  const bins = FRAME / 2 + 1;
  const bassBins = Math.max(1, Math.min(bins - 1, Math.round((BASS_HZ * FRAME) / rate)));
  const window = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME);
  const fft = new Fft(FRAME);
  const frame = new Float32Array(FRAME);
  const magnitudes = new Float32Array(bins);
  let previous = new Float32Array(bins);
  let current = new Float32Array(bins);
  let totalRise = 0;
  let totalLevel = 0;

  for (let f = 0; f < frameCount; f++) {
    const offset = f * HOP;
    for (let i = 0; i < FRAME; i++) frame[i] = samples[offset + i] * window[i];
    fft.magnitudes(frame, magnitudes);
    let rise = 0;
    let bassRise = 0;
    for (let k = 1; k < bins; k++) {
      current[k] = Math.log1p(magnitudes[k]);
      totalLevel += current[k];
      const delta = current[k] - previous[k];
      if (delta > 0 && f > 0) {
        rise += delta;
        if (k <= bassBins) bassRise += delta;
      }
    }
    strength[f] = rise;
    bass[f] = bassRise;
    totalRise += rise;
    [previous, current] = [current, previous];
  }
  const liveliness = totalLevel > 0 ? totalRise / totalLevel : 0;
  return { strength, bass, rate: rate / HOP, start: ONSET_LAG * (FRAME / rate), liveliness };
}

/**
 * Reads the beat of a piece of music: how fast it goes, where its beats fall and which of them
 * starts a bar.
 *
 * The tempo is found from how the onsets repeat, leaning towards 120 beats per minute between
 * readings that differ by twice or half, then the tempo and the beats' place are fitted together
 * over the whole sound. The beat that starts the bar is the one of each four with the strongest
 * bass. Null for a sound under six seconds, or one with next to nothing starting in it, such as a
 * held tone.
 */
export function estimateTempo(mono: Float32Array, sampleRate: number): TempoEstimate | null {
  if (!(sampleRate > 0) || mono.length < sampleRate * MIN_SECONDS) return null;
  const envelope = onsetEnvelope(mono, sampleRate);
  if (envelope.liveliness < MIN_LIVELINESS) return null;
  const strength = normalised(envelope.strength, envelope.rate);
  if (!strength) return null;
  const bass = normalised(envelope.bass, envelope.rate);
  const fps = envelope.rate;
  const onsets = bass ? blended(strength, bass) : strength;

  const roughBpm = roughTempo(onsets, fps);
  if (roughBpm === null) return null;
  const fit = settleOctave(onsets, fps, fitBeat(onsets, fps, roughBpm));
  const periodFrames = (fps * 60) / fit.bpm;
  const barBeat = strongestBeatOfBar(bass ?? strength, fit.phase, periodFrames);
  const firstDownbeatFrames = fit.phase + barBeat * periodFrames;
  const barSeconds = (BEATS_PER_BAR * 60) / fit.bpm;
  const bar = positiveModulo(envelope.start + firstDownbeatFrames / fps, barSeconds);
  return { bpm: fit.bpm, bar, confidence: fit.confidence };
}

/**
 * The onsets over every frequency and those in the bass, counted alike, so a kick drum on every
 * beat weighs as much as a snare that sounds on every other one.
 */
function blended(strength: Float32Array, bass: Float32Array): Float32Array {
  const onsets = new Float32Array(strength.length);
  for (let i = 0; i < onsets.length; i++) onsets[i] = strength[i] + bass[i];
  return onsets;
}

/** The envelope with its slow swell taken out, so only what stands above its surroundings is left, scaled to unit spread. */
function normalised(envelope: Float32Array, fps: number): Float32Array | null {
  const n = envelope.length;
  if (n === 0) return null;
  const half = Math.max(1, Math.round(fps / 2));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + envelope[i];
  const result = new Float32Array(n);
  let sum = 0;
  let sumSquares = 0;
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(n, i + half + 1);
    const localMean = (prefix[to] - prefix[from]) / (to - from);
    const value = Math.max(0, envelope[i] - localMean);
    result[i] = value;
    sum += value;
    sumSquares += value * value;
  }
  const mean = sum / n;
  const spread = Math.sqrt(Math.max(0, sumSquares / n - mean * mean));
  if (!(spread > 1e-9)) return null;
  for (let i = 0; i < n; i++) result[i] /= spread;
  return result;
}

function autocorrelation(envelope: Float32Array, lag: number): number {
  const n = envelope.length - lag;
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += envelope[i] * envelope[i + lag];
  return sum / n;
}

function tempoPrior(bpm: number): number {
  const octaves = Math.log2(bpm / PRIOR_BPM) / PRIOR_OCTAVES;
  return Math.exp(-0.5 * octaves * octaves);
}

/**
 * The tempo the onsets repeat at most, weighed towards 120: each period is scored by how well the
 * onsets match themselves that far on and twice that far on, so a beat with a bar behind it
 * outscores the eighth notes between beats.
 */
function roughTempo(envelope: Float32Array, fps: number): number | null {
  const minLag = Math.max(1, Math.floor((fps * 60) / MAX_BPM));
  const maxLag = Math.ceil((fps * 60) / MIN_BPM);
  if (envelope.length < maxLag * 2 + 1) return null;
  const correlations = new Float64Array(maxLag * 2 + 2);
  for (let lag = minLag; lag <= Math.min(maxLag * 2 + 1, envelope.length - 1); lag++) {
    correlations[lag] = autocorrelation(envelope, lag);
  }
  const scoreAt = (lag: number): number =>
    tempoPrior((fps * 60) / lag) * (correlations[lag] + 0.5 * correlations[Math.min(lag * 2, maxLag * 2 + 1)]);

  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const score = scoreAt(lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || !(bestScore > 0)) return null;
  let lag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const before = scoreAt(bestLag - 1);
    const after = scoreAt(bestLag + 1);
    const curvature = before - 2 * bestScore + after;
    if (curvature < 0) lag += (0.5 * (before - after)) / curvature;
  }
  return Math.min(MAX_BPM, Math.max(MIN_BPM, (fps * 60) / lag));
}

/**
 * How closely the onsets match themselves one beat on, from -1 to 1: near 0 for onsets that fall at
 * random and towards 1 for a beat that never wavers. A lag between whole frames is read between the
 * two around it.
 */
function correlationAt(envelope: Float32Array, lag: number): number {
  const n = envelope.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += envelope[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (envelope[i] - mean) * (envelope[i] - mean);
  variance /= n;
  if (!(variance > 0)) return 0;
  const covarianceAt = (whole: number): number => {
    const count = n - whole;
    if (count <= 0) return 0;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += (envelope[i] - mean) * (envelope[i + whole] - mean);
    return sum / count;
  };
  const below = Math.floor(lag);
  const fraction = lag - below;
  return (covarianceAt(below) * (1 - fraction) + covarianceAt(below + 1) * fraction) / variance;
}

/** How strongly the onsets fall on a grid of beats, on average over the beats the sound holds. */
function alignment(envelope: Float32Array, periodFrames: number, phase: number): number {
  let sum = 0;
  let count = 0;
  for (let at = phase; at < envelope.length - 1; at += periodFrames) {
    const index = Math.floor(at);
    const fraction = at - index;
    sum += envelope[index] * (1 - fraction) + envelope[index + 1] * fraction;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** The phase within one beat period that lines the grid up with the onsets best, and how well it does. */
function bestPhase(envelope: Float32Array, periodFrames: number, steps: number): { phase: number; score: number } {
  let phase = 0;
  let score = -Infinity;
  for (let step = 0; step < steps; step++) {
    const candidate = (step / steps) * periodFrames;
    const value = alignment(envelope, periodFrames, candidate);
    if (value > score) {
      score = value;
      phase = candidate;
    }
  }
  return { phase, score };
}

/**
 * Fits the tempo and the place of the beats together, from a rough tempo: the tempo is moved in
 * ever finer steps around the rough one, and at each the beats are slid to where they meet the
 * onsets best. A tempo within a twentieth of a whole number is taken whole when that fits as well.
 */
function fitBeat(
  envelope: Float32Array,
  fps: number,
  roughBpm: number
): { bpm: number; phase: number; confidence: number } {
  const search = (from: number, to: number, step: number, phaseSteps: number) => {
    let best = { bpm: roughBpm, phase: 0, score: -Infinity };
    for (let bpm = from; bpm <= to + 1e-9; bpm += step) {
      const { phase, score } = bestPhase(envelope, (fps * 60) / bpm, phaseSteps);
      if (score > best.score) best = { bpm, phase, score };
    }
    return best;
  };
  const coarse = search(roughBpm * 0.97, roughBpm * 1.03, 0.1, 32);
  let fine = search(coarse.bpm - 0.12, coarse.bpm + 0.12, 0.01, 64);
  const whole = Math.round(fine.bpm);
  if (Math.abs(whole - fine.bpm) < 0.05) {
    const wholeFit = bestPhase(envelope, (fps * 60) / whole, 64);
    if (wholeFit.score >= fine.score * 0.995) fine = { bpm: whole, ...wholeFit };
  }
  const periodFrames = (fps * 60) / fine.bpm;
  let phase = fine.phase;
  let score = fine.score;
  const span = periodFrames / 64;
  for (let step = -8; step <= 8; step++) {
    const candidate = fine.phase + (step / 8) * span;
    const value = alignment(envelope, periodFrames, positiveModulo(candidate, periodFrames));
    if (value > score) {
      score = value;
      phase = positiveModulo(candidate, periodFrames);
    }
  }
  const sureness = Math.min(1, Math.max(0, CONFIDENCE_SCALE * correlationAt(envelope, periodFrames)));
  const confidence = lacksAccent(envelope, periodFrames) ? sureness * UNACCENTED_DOUBT : sureness;
  return { bpm: fine.bpm, phase, confidence };
}

/**
 * Whether nothing marks the beat out from what comes between its beats: the onsets match themselves
 * at a half, a third or a quarter of the beat as closely as at the beat itself, as under a vibrato,
 * a tremolo or a run of even notes, where the tempo could as well be any multiple of what was read.
 */
function lacksAccent(envelope: Float32Array, periodFrames: number): boolean {
  const atBeat = correlationAt(envelope, periodFrames);
  return [2, 3, 4].some(
    (divisor) => periodFrames / divisor >= 2 && correlationAt(envelope, periodFrames / divisor) >= atBeat
  );
}

/**
 * The fitted beat, or twice its tempo when what falls halfway between its beats starts nearly as
 * strongly as what falls on them: a backbeat or a steady eighth heard as the halves of slower beats
 * is taken as the beat itself.
 */
function settleOctave(
  envelope: Float32Array,
  fps: number,
  fit: { bpm: number; phase: number; confidence: number }
): { bpm: number; phase: number; confidence: number } {
  if (fit.bpm * 2 > MAX_BPM) return fit;
  const periodFrames = (fps * 60) / fit.bpm;
  const onBeats = alignment(envelope, periodFrames, fit.phase);
  const between = alignment(envelope, periodFrames, fit.phase + periodFrames / 2);
  if (!(onBeats > 0) || between < OFFBEAT_SHARE * onBeats) return fit;
  return fitBeat(envelope, fps, fit.bpm * 2);
}

/** Which of each four beats, counted from the grid's first, carries the most bass. */
function strongestBeatOfBar(bass: Float32Array, phase: number, periodFrames: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
    const score = alignment(bass, periodFrames * BEATS_PER_BAR, phase + beat * periodFrames);
    if (score > bestScore) {
      bestScore = score;
      best = beat;
    }
  }
  return best;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
