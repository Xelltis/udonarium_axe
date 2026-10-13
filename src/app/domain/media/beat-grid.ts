import type { AudioAnalysis } from '@axe/domain/media/audio-analysis';

/** The beats of a track laid out evenly: how fast they come and where a bar starts. */
export interface BeatGrid {
  /** Beats per minute. */
  readonly bpm: number;
  /** When a bar's first beat falls, in seconds; every fourth beat on from or back from it starts a bar too. */
  readonly bar: number;
}

/** The beats in a bar. */
export const BEATS_PER_BAR = 4;
/** How sure a reading of the tempo must be before the beats it found are trusted. */
export const MIN_TEMPO_CONFIDENCE = 0.3;
/** The slowest and fastest tempo a grid may be set to. */
export const MIN_GRID_BPM = 30;
export const MAX_GRID_BPM = 300;

/** The length of one beat in seconds. */
export function beatLength(grid: BeatGrid): number {
  return 60 / grid.bpm;
}

/** The length of one bar in seconds. */
export function barLength(grid: BeatGrid): number {
  return beatLength(grid) * BEATS_PER_BAR;
}

/** How many beats from a bar's first beat a point in the track lies, counting back before it as less than none. */
export function beatsAt(grid: BeatGrid, seconds: number): number {
  return (seconds - grid.bar) / beatLength(grid);
}

/** Which beat of its bar a point in the track lies in, from 0 for the first to 3 for the last. */
export function beatOfBar(grid: BeatGrid, seconds: number): number {
  const beat = Math.floor(beatsAt(grid, seconds) + 1e-9);
  return ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
}

/** How far into its beat a point in the track lies, from 0 at the beat to just under 1 before the next. */
export function beatFraction(grid: BeatGrid, seconds: number): number {
  const beats = beatsAt(grid, seconds);
  return beats - Math.floor(beats + 1e-9);
}

/**
 * The next beat, or the next bar's first beat, after a point in the track, in seconds. A point just
 * a hair past a beat still counts that beat as passed.
 */
export function nextBoundary(grid: BeatGrid, seconds: number, unit: 'beat' | 'bar'): number {
  const length = unit === 'bar' ? barLength(grid) : beatLength(grid);
  const count = Math.floor((seconds - grid.bar) / length + 1e-6) + 1;
  return grid.bar + count * length;
}

/** The tempo set to a new value, the bar's first beat staying where it was heard. */
export function withBpm(grid: BeatGrid, bpm: number): BeatGrid {
  return { bpm: clampBpm(bpm), bar: grid.bar };
}

/** The grid moved so a bar starts at a point in the track, at the same tempo. */
export function withDownbeatAt(grid: BeatGrid, seconds: number): BeatGrid {
  const bar = barLength(grid);
  return { bpm: grid.bpm, bar: ((seconds % bar) + bar) % bar };
}

/** A tempo kept within the range a grid may hold. */
export function clampBpm(bpm: number): number {
  return Math.min(MAX_GRID_BPM, Math.max(MIN_GRID_BPM, bpm));
}

/**
 * The grid a track's beats are taken from: the one set by hand when there is one, or else the one
 * the analysis heard when it is sure enough; null when neither is.
 */
export function effectiveGrid(manual: BeatGrid | null, analysis: AudioAnalysis | null): BeatGrid | null {
  if (manual) return manual;
  if (!analysis || analysis.bpm === null || analysis.bar === null) return null;
  if (analysis.confidence < MIN_TEMPO_CONFIDENCE) return null;
  return { bpm: analysis.bpm, bar: analysis.bar };
}

/**
 * Reads a grid set by hand as it was sent or saved, or null when there is none: empty or broken text,
 * a tempo out of range, or no place for the bar.
 */
export function readBeatGrid(raw: unknown): BeatGrid | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { bpm, bar } = parsed as Record<string, unknown>;
    if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < MIN_GRID_BPM || bpm > MAX_GRID_BPM) return null;
    if (typeof bar !== 'number' || !Number.isFinite(bar) || bar < 0) return null;
    return { bpm, bar };
  } catch {
    return null;
  }
}

/** Writes a grid set by hand down as the text `readBeatGrid` reads back; empty for none. */
export function writeBeatGrid(grid: BeatGrid | null): string {
  if (!grid) return '';
  return JSON.stringify({ bpm: Math.round(grid.bpm * 1000) / 1000, bar: Math.round(grid.bar * 10000) / 10000 });
}
