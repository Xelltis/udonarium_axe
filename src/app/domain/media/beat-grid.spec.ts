import type { AudioAnalysis } from '@axe/domain/media/audio-analysis';
import {
  barLength,
  beatFraction,
  beatOfBar,
  beatsAt,
  effectiveGrid,
  nextBoundary,
  readBeatGrid,
  withBpm,
  withDownbeatAt,
  writeBeatGrid,
} from '@axe/domain/media/beat-grid';

const grid = { bpm: 120, bar: 0.25 };

const analysis: AudioAnalysis = {
  version: 1,
  duration: 60,
  lufs: -14,
  peak: -1,
  start: 0,
  end: 60,
  bpm: 100,
  bar: 0.4,
  confidence: 0.8,
};

describe('beat grid', () => {
  it('counts beats from the bar it was set by, back before it as less than none', () => {
    expect(beatsAt(grid, 0.25)).toBe(0);
    expect(beatsAt(grid, 1.25)).toBe(2);
    expect(beatsAt(grid, 0)).toBeCloseTo(-0.5, 9);
  });

  it('tells which beat of its bar a point lies in, before the first bar too', () => {
    expect(beatOfBar(grid, 0.25)).toBe(0);
    expect(beatOfBar(grid, 0.8)).toBe(1);
    expect(beatOfBar(grid, 1.8)).toBe(3);
    expect(beatOfBar(grid, 2.25)).toBe(0);
    expect(beatOfBar(grid, 0.1)).toBe(3);
  });

  it('tells how far into its beat a point lies', () => {
    expect(beatFraction(grid, 0.5)).toBeCloseTo(0.5, 9);
    expect(beatFraction(grid, 0.75)).toBeCloseTo(0, 9);
  });

  it('finds the next beat and the next bar after a point', () => {
    expect(nextBoundary(grid, 0.3, 'beat')).toBeCloseTo(0.75, 9);
    expect(nextBoundary(grid, 0.75, 'beat')).toBeCloseTo(1.25, 9);
    expect(nextBoundary(grid, 0.3, 'bar')).toBeCloseTo(2.25, 9);
    expect(nextBoundary(grid, 0, 'bar')).toBeCloseTo(0.25, 9);
    expect(barLength(grid)).toBe(2);
  });

  it('keeps the bar where it was heard when the tempo is doubled or halved', () => {
    expect(withBpm(grid, 240)).toEqual({ bpm: 240, bar: 0.25 });
    expect(withBpm(grid, 10)).toEqual({ bpm: 30, bar: 0.25 });
  });

  it('moves the bar to a point at the same tempo, as the earliest bar there is', () => {
    expect(withDownbeatAt(grid, 5.1)).toEqual({ bpm: 120, bar: expect.closeTo(1.1, 9) });
  });
});

describe('effectiveGrid()', () => {
  it('takes the beats set by hand over those the reading heard', () => {
    expect(effectiveGrid(grid, analysis)).toBe(grid);
  });

  it('takes the reading only when it is sure enough of the tempo', () => {
    expect(effectiveGrid(null, analysis)).toEqual({ bpm: 100, bar: 0.4 });
    expect(effectiveGrid(null, { ...analysis, confidence: 0.1 })).toBeNull();
    expect(effectiveGrid(null, { ...analysis, bpm: null, bar: null })).toBeNull();
    expect(effectiveGrid(null, null)).toBeNull();
  });
});

describe('readBeatGrid()', () => {
  it('reads back what was written', () => {
    expect(readBeatGrid(writeBeatGrid({ bpm: 127.5, bar: 0.4321 }))).toEqual({ bpm: 127.5, bar: 0.4321 });
    expect(writeBeatGrid(null)).toBe('');
  });

  it('reads empty, broken or out-of-range text as none', () => {
    expect(readBeatGrid('')).toBeNull();
    expect(readBeatGrid(undefined)).toBeNull();
    expect(readBeatGrid('{"bpm":')).toBeNull();
    expect(readBeatGrid(JSON.stringify({ bpm: 1000, bar: 0 }))).toBeNull();
    expect(readBeatGrid(JSON.stringify({ bpm: '', bar: 0 }))).toBeNull();
    expect(readBeatGrid(JSON.stringify({ bpm: 120 }))).toBeNull();
    expect(readBeatGrid(JSON.stringify({ bpm: 120, bar: -1 }))).toBeNull();
  });
});
