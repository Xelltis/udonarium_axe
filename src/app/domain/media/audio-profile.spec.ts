import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { AUDIO_ANALYSIS_VERSION, type AudioAnalysis, writeAudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AudioTag } from '@axe/domain/media/audio-tag';

const reading: AudioAnalysis = {
  version: AUDIO_ANALYSIS_VERSION,
  duration: 90,
  lufs: -13,
  peak: -0.5,
  start: 0.2,
  end: 88,
  bpm: 140,
  bar: 0.1,
  confidence: 0.7,
};

describe('AudioProfile', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    AudioProfile.clearLocal();
  });

  afterEach(() => {
    AudioProfile.clearLocal();
  });

  it('reads nothing for a sound with a tag from an older version, which has no reading on it', () => {
    const tag = AudioTag.create('old-track');
    tag.removeAttribute('analysis');
    tag.removeAttribute('beatGrid');
    tag.removeAttribute('cues');

    expect(AudioProfile.analysisOf('old-track')).toBeNull();
    expect(AudioProfile.gridOf('old-track')).toBeNull();
    expect(AudioProfile.cuesOf('old-track')).toEqual([null, null, null, null]);
  });

  it('shares a reading on the sound tag, making the tag when the sound had none', () => {
    AudioProfile.share('fresh', reading);

    expect(AudioTag.get('fresh').tag).toBe('BGM');
    expect(AudioTag.get('fresh').analysis).toBe(writeAudioAnalysis(reading));
    expect(AudioProfile.analysisOf('fresh')).toEqual(reading);
  });

  it('uses a reading kept on this device while the room has none', () => {
    AudioProfile.keepLocal('mine', reading);

    expect(AudioProfile.analysisOf('mine')).toEqual(reading);
    expect(AudioProfile.sharedAnalysisOf('mine')).toBeNull();
  });

  it('takes the reading made by the later version, and the room one when they are level', () => {
    AudioProfile.share('both', { ...reading, lufs: -20 });
    AudioProfile.keepLocal('both', { ...reading, lufs: -10 });

    expect(AudioProfile.analysisOf('both')?.lufs).toBe(-20);

    AudioProfile.keepLocal('both', { ...reading, version: AUDIO_ANALYSIS_VERSION + 1, lufs: -10 });

    expect(AudioProfile.analysisOf('both')?.lufs).toBe(-10);
  });

  it('takes the beats set by hand over those the reading heard, and goes back to them when cleared', () => {
    AudioProfile.share('beats', reading);
    AudioProfile.setGrid('beats', { bpm: 70, bar: 0.5 });

    expect(AudioProfile.gridOf('beats')).toEqual({ bpm: 70, bar: 0.5 });

    AudioProfile.setGrid('beats', null);

    expect(AudioTag.get('beats').beatGrid).toBe('');
    expect(AudioProfile.gridOf('beats')).toEqual({ bpm: 140, bar: 0.1 });
  });

  it('makes no tag only to clear what a sound never had', () => {
    AudioProfile.setGrid('untouched', null);
    AudioProfile.setCues('untouched', [null, null, null, null]);

    expect(AudioTag.get('untouched')).toBeFalsy();
  });

  it('keeps the reading, the beats and the marks through a saved room', () => {
    AudioProfile.share('saved', reading);
    AudioProfile.setGrid('saved', { bpm: 96, bar: 1.2 });
    AudioProfile.setCues('saved', [5, null, null, 80]);
    const xml = ObjectSerializer.instance.toXml(AudioTag.get('saved'));
    AudioTag.get('saved').analysis = '';
    AudioProfile.setGrid('saved', null);
    AudioProfile.setCues('saved', [null, null, null, null]);

    ObjectSerializer.instance.parseXml(xml);

    expect(AudioProfile.analysisOf('saved')).toEqual(reading);
    expect(AudioProfile.gridOf('saved')).toEqual({ bpm: 96, bar: 1.2 });
    expect(AudioProfile.cuesOf('saved')).toEqual([5, null, null, 80]);
  });

  it('marks places in a sound for the room', () => {
    AudioProfile.setCues('marked', [null, 42, null, null]);

    expect(AudioProfile.cuesOf('marked')).toEqual([null, 42, null, null]);
  });
});
