import type { AudioAnalysisResult } from '@axe/core/audio/audio-analysis';

/**
 * The version of the reading a sound's analysis was made by. A reading from an earlier version is
 * made again; one from a later version, sent by a newer peer, is kept as it is.
 */
export const AUDIO_ANALYSIS_VERSION = 1;

/** A sound's reading as the room keeps it on the sound's tag. */
export interface AudioAnalysis {
  /** The version of the reading it was made by. */
  readonly version: number;
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
  /** The tempo in beats per minute, or null when none was heard. */
  readonly bpm: number | null;
  /** When the first bar's first beat falls, in seconds, or null with no tempo. */
  readonly bar: number | null;
  /** How sure the tempo is, from 0 to 1. */
  readonly confidence: number;
}

function round(value: number, places: number): number {
  const scale = Math.pow(10, places);
  return Math.round(value * scale) / scale;
}

/** A fresh reading as the room keeps it: stamped with this version and rounded to what matters. */
export function analysisFromResult(result: AudioAnalysisResult): AudioAnalysis {
  return {
    version: AUDIO_ANALYSIS_VERSION,
    duration: round(result.duration, 3),
    lufs: result.lufs === null ? null : round(result.lufs, 2),
    peak: result.peak === null ? null : round(result.peak, 2),
    start: round(result.start, 3),
    end: round(result.end, 3),
    bpm: result.bpm === null ? null : round(result.bpm, 3),
    bar: result.bar === null || result.bpm === null ? null : round(result.bar, 4),
    confidence: round(result.confidence, 2),
  };
}

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * Reads a sound's analysis as it was sent or saved, or null when there is none to read.
 *
 * Text that is empty, not JSON, or missing the version, the length or where the sound starts and
 * stops reads as no analysis, so the sound is read again. A loudness, peak or tempo that is missing
 * or out of range reads as unknown, and a tempo without a place for its bar, or the other way
 * round, reads as no tempo.
 */
export function readAudioAnalysis(raw: unknown): AudioAnalysis | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    parsed = value as Record<string, unknown>;
  } catch {
    return null;
  }
  const version = finite(parsed['v'], 1, Number.MAX_SAFE_INTEGER);
  const duration = finite(parsed['dur'], 0, 24 * 60 * 60);
  const start = finite(parsed['start'], 0, 24 * 60 * 60);
  const end = finite(parsed['end'], 0, 24 * 60 * 60);
  if (version === null || duration === null || start === null || end === null) return null;
  const bpm = finite(parsed['bpm'], 20, 400);
  const bar = finite(parsed['bar'], 0, 60);
  const hasTempo = bpm !== null && bar !== null;
  return {
    version: Math.floor(version),
    duration,
    lufs: finite(parsed['lufs'], -120, 20),
    peak: finite(parsed['peak'], -200, 20),
    start,
    end,
    bpm: hasTempo ? bpm : null,
    bar: hasTempo ? bar : null,
    confidence: hasTempo ? (finite(parsed['conf'], 0, 1) ?? 0) : 0,
  };
}

/** Writes a sound's analysis down as the text `readAudioAnalysis` reads back. */
export function writeAudioAnalysis(analysis: AudioAnalysis): string {
  return JSON.stringify({
    v: analysis.version,
    dur: analysis.duration,
    lufs: analysis.lufs,
    peak: analysis.peak,
    start: analysis.start,
    end: analysis.end,
    bpm: analysis.bpm,
    bar: analysis.bar,
    conf: analysis.confidence,
  });
}

/** Whether a reading was made by a version older than this one, and so should be made again. */
export function isAnalysisOutdated(analysis: AudioAnalysis | null): boolean {
  return analysis === null || analysis.version < AUDIO_ANALYSIS_VERSION;
}

/** The kinds of sound brought to a loudness of their own: music, the background sounds under it, and one-shot effects. */
export type LevelKind = 'music' | 'background' | 'effect';

/**
 * The loudness each kind is brought to, in LUFS. Music and effects stand at the same level; the
 * background sits well under them, as rain under a song.
 */
export const LEVEL_TARGET_LUFS: Readonly<Record<LevelKind, number>> = {
  music: -16,
  background: -24,
  effect: -16,
};

/** The most a quiet sound is turned up, in dB. */
export const LEVEL_MAX_BOOST_DB = 12;
/** The most a loud sound is turned down, in dB. */
export const LEVEL_MAX_CUT_DB = 24;
/** How close to full scale a sound's loudest sample may be turned up to, in dB, leaving room for peaks between samples. */
export const LEVEL_PEAK_CEILING_DB = -1;

/**
 * How far to turn a sound up or down, in dB, to bring it to the loudness of its kind.
 *
 * A sound is turned up no more than `LEVEL_MAX_BOOST_DB` and never so far that its loudest sample
 * passes `LEVEL_PEAK_CEILING_DB`, and turned down no more than `LEVEL_MAX_CUT_DB`. A sound that has
 * not been read, or is silent, is left as it is.
 */
export function autoLevelGainDb(analysis: AudioAnalysis | null, kind: LevelKind): number {
  if (!analysis || analysis.lufs === null) return 0;
  let gain = LEVEL_TARGET_LUFS[kind] - analysis.lufs;
  gain = Math.min(LEVEL_MAX_BOOST_DB, Math.max(-LEVEL_MAX_CUT_DB, gain));
  if (gain > 0 && analysis.peak !== null) gain = Math.min(gain, Math.max(0, LEVEL_PEAK_CEILING_DB - analysis.peak));
  return gain;
}

/** `autoLevelGainDb` as a factor to multiply the sound by. */
export function autoLevelGain(analysis: AudioAnalysis | null, kind: LevelKind): number {
  return Math.pow(10, autoLevelGainDb(analysis, kind) / 20);
}
