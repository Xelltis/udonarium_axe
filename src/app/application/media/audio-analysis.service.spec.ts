import { TestBed } from '@angular/core/testing';
import {
  AUDIO_ANALYSIS_DELAYS,
  AUDIO_ANALYZER,
  AudioAnalysisService,
} from '@axe/application/media/audio-analysis.service';
import { AUDIO_ANALYSIS_CACHE_KEY } from '@axe/application/media/audio-analysis-cache';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import type { AudioAnalysisResult } from '@axe/core/audio/audio-analysis';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { AUDIO_ANALYSIS_VERSION, writeAudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const result: AudioAnalysisResult = {
  duration: 120,
  lufs: -11,
  peak: -0.2,
  start: 0.5,
  end: 118,
  bpm: 132,
  bar: 0.2,
  confidence: 0.9,
};

describe('AudioAnalysisService', () => {
  let canEditTabletop: boolean;
  let analyzer: ReturnType<typeof vi.fn<(blob: Blob) => Promise<AudioAnalysisResult | null>>>;
  const added: string[] = [];

  function addSound(identifier: string): void {
    AudioStorage.instance.add({
      identifier,
      name: `${identifier}.mp3`,
      type: 'audio/mpeg',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
      url: '',
    });
    added.push(identifier);
  }

  function start(): AudioAnalysisService {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: AUDIO_ANALYZER, useValue: analyzer },
        { provide: AUDIO_ANALYSIS_DELAYS, useValue: { sharing: 0, watching: 0, gap: 0 } },
        {
          provide: RolePermissionService,
          useValue: {
            get canEditTabletop() {
              return canEditTabletop;
            },
          },
        },
      ],
    });
    const service = TestBed.inject(AudioAnalysisService);
    TestBed.tick();
    return service;
  }

  beforeEach(() => {
    canEditTabletop = true;
    analyzer = vi.fn((_blob: Blob) => Promise.resolve<AudioAnalysisResult | null>(result));
  });

  afterEach(() => {
    for (const identifier of added.splice(0)) AudioStorage.instance.delete(identifier);
    vi.unstubAllGlobals();
  });

  it('reads a sound and shares the reading on its tag', async () => {
    addSound('track-a');
    start();

    await vi.waitFor(() => expect(AudioTag.get('track-a')?.analysis).toBeTruthy());
    expect(AudioProfile.analysisOf('track-a')?.lufs).toBe(-11);
    expect(analyzer).toHaveBeenCalledTimes(1);
  });

  it('keeps a reading to itself for a guest, who may not change the room', async () => {
    canEditTabletop = false;
    addSound('track-b');
    start();

    await vi.waitFor(() => expect(AudioProfile.analysisOf('track-b')).not.toBeNull());
    expect(AudioTag.get('track-b')).toBeFalsy();
  });

  it('keeps the reading in this browser for the next room', async () => {
    addSound('track-c');
    start();

    await vi.waitFor(() => expect(localStorage.getItem(AUDIO_ANALYSIS_CACHE_KEY) ?? '').toContain('track-c'));
  });

  it('reads nothing the room already has a reading for', async () => {
    addSound('track-d');
    AudioProfile.share('track-d', {
      version: AUDIO_ANALYSIS_VERSION,
      duration: 3,
      lufs: -20,
      peak: -3,
      start: 0,
      end: 3,
      bpm: null,
      bar: null,
      confidence: 0,
    });
    addSound('track-e');
    start();

    await vi.waitFor(() => expect(AudioTag.get('track-e')?.analysis).toBeTruthy());
    expect(analyzer).toHaveBeenCalledTimes(1);
    expect(AudioProfile.analysisOf('track-d')?.lufs).toBe(-20);
  });

  function keptInBrowser(identifier: string, lufs: number): void {
    localStorage.setItem(
      AUDIO_ANALYSIS_CACHE_KEY,
      JSON.stringify({
        [identifier]: writeAudioAnalysis({
          version: AUDIO_ANALYSIS_VERSION,
          duration: 9,
          lufs,
          peak: -10,
          start: 0,
          end: 9,
          bpm: null,
          bar: null,
          confidence: 0,
        }),
      })
    );
  }

  it('shares a reading kept in this browser without reading the sound again', async () => {
    keptInBrowser('track-f', -30);
    addSound('track-f');
    AudioTag.create('track-f');
    start();

    await vi.waitFor(() => expect(AudioTag.get('track-f')?.analysis).toContain('-30'));
    expect(analyzer).not.toHaveBeenCalled();
  });

  it('makes no tag to share a reading kept in this browser on, as the room may still be sending its own', async () => {
    keptInBrowser('track-k', -24);
    addSound('track-k');
    const service = start();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(AudioTag.get('track-k')).toBeFalsy();
    expect(AudioProfile.analysisOf('track-k')?.lufs).toBe(-24);
    expect(service.isPending('track-k')).toBe(false);
    expect(analyzer).not.toHaveBeenCalled();
  });

  it('keeps the readings the room shares in this browser in one write, however many there are', async () => {
    for (const identifier of ['track-l', 'track-m', 'track-n']) {
      addSound(identifier);
      AudioProfile.share(identifier, {
        version: AUDIO_ANALYSIS_VERSION,
        duration: 3,
        lufs: -20,
        peak: -3,
        start: 0,
        end: 3,
        bpm: null,
        bar: null,
        confidence: 0,
      });
    }
    const write = vi.spyOn(localStorage, 'setItem');
    start();

    await vi.waitFor(() => expect(localStorage.getItem(AUDIO_ANALYSIS_CACHE_KEY) ?? '').toContain('track-n'));
    expect(write.mock.calls.filter(([key]) => key === AUDIO_ANALYSIS_CACHE_KEY)).toHaveLength(1);
  });

  it('does not look through the library again as the room turns its effects', async () => {
    addSound('track-j');
    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    const service = start();
    await vi.waitFor(() => expect(AudioTag.get('track-j')?.analysis).toBeTruthy());
    await vi.waitFor(() => expect(service.reading()).toBe(''));
    const look = vi.spyOn(AudioProfile, 'sharedAnalysisOf');
    const changes = TestBed.inject(ObjectChangeService);

    for (const fx of ['{"filter":0.2}', '{"filter":0.4}', '{"filter":0.6}']) {
      jukebox.fx = fx;
      changes.notifyChanged('Jukebox');
      TestBed.tick();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(look).not.toHaveBeenCalled();

    jukebox.audioIdentifier = 'track-j';
    changes.notifyChanged('Jukebox');
    TestBed.tick();
    await vi.waitFor(() => expect(look).toHaveBeenCalled());
    jukebox.destroy();
  });

  it('does not read again a sound that could not be read', async () => {
    analyzer.mockResolvedValue(null);
    addSound('broken');
    const service = start();

    await vi.waitFor(() => expect(analyzer).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(service.reading()).toBe(''));
    addSound('another');
    TestBed.inject(ObjectChangeService).fileVersion.update((value) => value + 1);
    TestBed.tick();

    await vi.waitFor(() => expect(analyzer).toHaveBeenCalledTimes(2));
    expect(service.isPending('broken')).toBe(false);
  });

  it('orders the library without drawing from Math.random, which effects and the table draw from', async () => {
    const draw = Math.random.bind(Math);
    const callers: string[] = [];
    vi.spyOn(Math, 'random').mockImplementation(() => {
      callers.push(new Error().stack ?? '');
      return draw();
    });
    addSound('track-h');
    addSound('track-i');
    start();

    await vi.waitFor(() => expect(analyzer).toHaveBeenCalledTimes(2));
    expect(callers.filter((stack) => stack.includes('readingOrder'))).toEqual([]);
  });

  it('reads nothing on a device short of memory', async () => {
    vi.stubGlobal('navigator', { ...navigator, deviceMemory: 1 });
    addSound('track-g');
    start();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(analyzer).not.toHaveBeenCalled();
  });
});
