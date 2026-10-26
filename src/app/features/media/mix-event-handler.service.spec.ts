import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { JukeboxEngineService } from '@axe/application/media/jukebox-engine.service';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MusicBus } from '@axe/core/audio/music-bus';
import { AudioOutput } from '@axe/core/storage/audio-output';
import { DEFAULT_DJ_SETTINGS } from '@axe/domain/media/dj-settings';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Config } from '@axe/domain/peer/config';
import { AUTOMIX_TICK_MS, MixEventHandlerService } from '@axe/features/media/mix-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('MixEventHandlerService', () => {
  const analysisVersion = signal(0);
  let jukebox: Jukebox;
  let setDucking: MockInstance<(enabled: boolean) => void>;

  function start(): void {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: AudioAnalysisService, useValue: { version: analysisVersion } }],
    });
    TestBed.inject(MixEventHandlerService);
    TestBed.tick();
  }

  function changed(identifier: string): void {
    TestBed.inject(ObjectChangeService).notifyChanged(identifier);
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setDucking = vi.spyOn(MusicBus, 'setDucking').mockImplementation(() => {});
    vi.spyOn(AudioOutput, 'setChannelVolume').mockImplementation(() => {});
    jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    const config = new Config('Config');
    config.initialize();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ducks the music under effects while it plays and the room says so, and listens for nothing while quiet', () => {
    start();
    expect(setDucking).toHaveBeenLastCalledWith(false);

    jukebox.isPlaying = true;
    changed('Jukebox');
    expect(setDucking).toHaveBeenLastCalledWith(true);

    Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, ducking: false };
    changed('Config');
    expect(setDucking).toHaveBeenLastCalledWith(false);
  });

  it('puts a change of the room’s volumes on the channels once, made here or by another peer', () => {
    start();
    const applied = vi.spyOn(TestBed.inject(PersonalVolumeService), 'applyToChannels');

    Config.instance.roomVolume = 0.3;
    changed('Config');
    expect(applied).toHaveBeenCalledTimes(1);

    Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, ducking: false };
    changed('Config');
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it('eases the tracks to a change of the room’s mix once, and to nothing else the room changes', () => {
    const refreshMix = vi.spyOn(JukeboxEngineService.prototype, 'refreshMix').mockImplementation(() => {});
    start();
    refreshMix.mockClear();

    Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, ducking: false };
    changed('Config');
    expect(refreshMix).toHaveBeenCalledTimes(1);

    Config.instance.roomVolume = 0.3;
    changed('Config');
    expect(refreshMix).toHaveBeenCalledTimes(1);
  });

  it('remixes whenever a reading arrives or changes', () => {
    const refreshMix = vi.spyOn(JukeboxEngineService.prototype, 'refreshMix').mockImplementation(() => {});
    start();
    refreshMix.mockClear();

    analysisVersion.update((value) => value + 1);
    TestBed.tick();

    expect(refreshMix).toHaveBeenCalledOnce();
  });

  it('looks for the point to move on only while the room plays', () => {
    const tick = vi.spyOn(JukeboxEngineService.prototype, 'tickAutomix').mockImplementation(() => {});
    start();

    vi.advanceTimersByTime(AUTOMIX_TICK_MS * 4);
    expect(tick).not.toHaveBeenCalled();

    jukebox.isPlaying = true;
    changed('Jukebox');
    vi.advanceTimersByTime(AUTOMIX_TICK_MS * 4);
    expect(tick).toHaveBeenCalledTimes(4);

    jukebox.isPlaying = false;
    changed('Jukebox');
    vi.advanceTimersByTime(AUTOMIX_TICK_MS * 4);
    expect(tick).toHaveBeenCalledTimes(4);
  });
});
