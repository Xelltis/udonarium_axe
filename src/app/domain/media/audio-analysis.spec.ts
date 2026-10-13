import {
  analysisFromResult,
  AUDIO_ANALYSIS_VERSION,
  type AudioAnalysis,
  autoLevelGain,
  autoLevelGainDb,
  isAnalysisOutdated,
  readAudioAnalysis,
  writeAudioAnalysis,
} from '@axe/domain/media/audio-analysis';

const reading: AudioAnalysis = {
  version: AUDIO_ANALYSIS_VERSION,
  duration: 183.25,
  lufs: -12.5,
  peak: -0.4,
  start: 0.12,
  end: 180.5,
  bpm: 128,
  bar: 0.231,
  confidence: 0.82,
};

describe('analysisFromResult()', () => {
  it('stamps the version and rounds to what matters', () => {
    const analysis = analysisFromResult({
      duration: 10.123456,
      lufs: -14.56789,
      peak: -1.23456,
      start: 0.0123456,
      end: 9.87654,
      bpm: 127.98765,
      bar: 0.123456789,
      confidence: 0.6789,
    });

    expect(analysis).toEqual({
      version: AUDIO_ANALYSIS_VERSION,
      duration: 10.123,
      lufs: -14.57,
      peak: -1.23,
      start: 0.012,
      end: 9.877,
      bpm: 127.988,
      bar: 0.1235,
      confidence: 0.68,
    });
  });

  it('keeps a silent sound and one with no tempo as unknown', () => {
    const analysis = analysisFromResult({
      duration: 2,
      lufs: null,
      peak: null,
      start: 0,
      end: 0,
      bpm: null,
      bar: null,
      confidence: 0,
    });

    expect([analysis.lufs, analysis.peak, analysis.bpm, analysis.bar]).toEqual([null, null, null, null]);
  });
});

describe('readAudioAnalysis()', () => {
  it('reads back what was written', () => {
    expect(readAudioAnalysis(writeAudioAnalysis(reading))).toEqual(reading);
  });

  it('reads empty, broken or foreign text as no analysis', () => {
    expect(readAudioAnalysis('')).toBeNull();
    expect(readAudioAnalysis(undefined)).toBeNull();
    expect(readAudioAnalysis(12)).toBeNull();
    expect(readAudioAnalysis('{')).toBeNull();
    expect(readAudioAnalysis('[]')).toBeNull();
    expect(readAudioAnalysis('null')).toBeNull();
  });

  it('reads an analysis missing its version, length or span as none, so the sound is read again', () => {
    expect(readAudioAnalysis(JSON.stringify({ dur: 3, start: 0, end: 3 }))).toBeNull();
    expect(readAudioAnalysis(JSON.stringify({ v: 1, start: 0, end: 3 }))).toBeNull();
    expect(readAudioAnalysis(JSON.stringify({ v: 1, dur: '', start: 0, end: 3 }))).toBeNull();
    expect(readAudioAnalysis(JSON.stringify({ v: 1, dur: 3, start: '0', end: 3 }))).toBeNull();
  });

  it('reads a loudness or peak that is missing or out of range as unknown', () => {
    const analysis = readAudioAnalysis(
      JSON.stringify({ v: 1, dur: 3, start: 0, end: 3, lufs: 'loud', peak: 99, bpm: null, bar: null })
    );

    expect(analysis?.lufs).toBeNull();
    expect(analysis?.peak).toBeNull();
  });

  it('reads a tempo without its bar, or a bar without its tempo, as no tempo', () => {
    const noBar = readAudioAnalysis(JSON.stringify({ v: 1, dur: 3, start: 0, end: 3, bpm: 120, conf: 0.9 }));
    const noTempo = readAudioAnalysis(JSON.stringify({ v: 1, dur: 3, start: 0, end: 3, bar: 0.5, conf: 0.9 }));

    expect([noBar?.bpm, noBar?.bar, noBar?.confidence]).toEqual([null, null, 0]);
    expect([noTempo?.bpm, noTempo?.bar]).toEqual([null, null]);
  });

  it('keeps a reading from a later version as it is', () => {
    const later = readAudioAnalysis(writeAudioAnalysis({ ...reading, version: AUDIO_ANALYSIS_VERSION + 1 }));

    expect(later?.version).toBe(AUDIO_ANALYSIS_VERSION + 1);
    expect(isAnalysisOutdated(later)).toBe(false);
  });
});

describe('isAnalysisOutdated()', () => {
  it('calls no analysis, or one from an earlier version, outdated', () => {
    expect(isAnalysisOutdated(null)).toBe(true);
    expect(isAnalysisOutdated({ ...reading, version: AUDIO_ANALYSIS_VERSION - 1 })).toBe(true);
    expect(isAnalysisOutdated(reading)).toBe(false);
  });
});

describe('autoLevelGainDb()', () => {
  it('turns a loud track down to the loudness of music', () => {
    expect(autoLevelGainDb({ ...reading, lufs: -9 }, 'music')).toBeCloseTo(-7, 6);
  });

  it('sets the background well under the music', () => {
    expect(autoLevelGainDb({ ...reading, lufs: -16 }, 'background')).toBeCloseTo(-8, 6);
  });

  it('turns a quiet track up only as far as its peak allows', () => {
    expect(autoLevelGainDb({ ...reading, lufs: -26, peak: -12 }, 'music')).toBeCloseTo(10, 6);
    expect(autoLevelGainDb({ ...reading, lufs: -26, peak: -4 }, 'music')).toBeCloseTo(3, 6);
    expect(autoLevelGainDb({ ...reading, lufs: -26, peak: -0.5 }, 'music')).toBe(0);
  });

  it('turns no sound up or down past its limits', () => {
    expect(autoLevelGainDb({ ...reading, lufs: -60, peak: -40 }, 'music')).toBe(12);
    expect(autoLevelGainDb({ ...reading, lufs: 10 }, 'effect')).toBe(-24);
  });

  it('leaves a sound that has not been read, or is silent, as it is', () => {
    expect(autoLevelGainDb(null, 'music')).toBe(0);
    expect(autoLevelGainDb({ ...reading, lufs: null }, 'music')).toBe(0);
    expect(autoLevelGain(null, 'music')).toBe(1);
  });

  it('gives the factor for the decibels', () => {
    expect(autoLevelGain({ ...reading, lufs: -10 }, 'music')).toBeCloseTo(Math.pow(10, -6 / 20), 6);
  });
});
