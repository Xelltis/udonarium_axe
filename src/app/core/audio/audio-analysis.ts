import { measureLoudness } from '@axe/core/audio/loudness';
import { findSoundSpan } from '@axe/core/audio/sound-span';
import { estimateTempo } from '@axe/core/audio/tempo';

/** What reading a whole sound tells: how loud it is, where it starts and stops, and the beat it keeps. */
export interface AudioAnalysisResult {
  /** The length of the sound in seconds. */
  readonly duration: number;
  /** The integrated loudness in LUFS, or null for a silent sound. */
  readonly lufs: number | null;
  /** The loudest sample in dB below full scale, or null for a silent sound. */
  readonly peak: number | null;
  /** Where the sound first rises above silence, in seconds. */
  readonly start: number;
  /** Where the sound last falls to silence, in seconds. */
  readonly end: number;
  /** The tempo in beats per minute, or null when the sound is too short to hold one or has no onsets. */
  readonly bpm: number | null;
  /** When the first bar's first beat falls, in seconds, or null with no tempo. */
  readonly bar: number | null;
  /** How sure the tempo is, from 0 to 1; 0 with no tempo. */
  readonly confidence: number;
}

/** The request a page sends the analysis worker: the sound's channels, handed over rather than copied. */
export interface AudioAnalysisRequest {
  readonly id: number;
  readonly channels: Float32Array[];
  readonly sampleRate: number;
}

/** What the analysis worker sends back for one request: the reading, or null when it failed. */
export interface AudioAnalysisResponse {
  readonly id: number;
  readonly result: AudioAnalysisResult | null;
}

/**
 * Reads a whole decoded sound: its loudness and peak over every channel, where it starts and stops,
 * and its tempo from the channels mixed down to one.
 */
export function analyzeChannels(channels: readonly Float32Array[], sampleRate: number): AudioAnalysisResult {
  const length = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0);
  const duration = sampleRate > 0 ? length / sampleRate : 0;
  const loudness = measureLoudness(channels, sampleRate);
  const span = findSoundSpan(channels, sampleRate);
  const tempo = estimateTempo(mixDown(channels, length), sampleRate);
  return {
    duration,
    lufs: loudness.integrated,
    peak: loudness.peak,
    start: span.start,
    end: span.end,
    bpm: tempo?.bpm ?? null,
    bar: tempo?.bar ?? null,
    confidence: tempo?.confidence ?? 0,
  };
}

function mixDown(channels: readonly Float32Array[], length: number): Float32Array {
  if (channels.length === 1) return channels[0];
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) mono[i] += channel[i];
  }
  const scale = channels.length > 0 ? 1 / channels.length : 0;
  for (let i = 0; i < length; i++) mono[i] *= scale;
  return mono;
}
