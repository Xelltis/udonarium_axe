import { TestBed } from '@angular/core/testing';
import { JukeboxEngineService } from '@axe/application/media/jukebox-engine.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { JukeboxEngine } from '@axe/infrastructure/media/jukebox-engine';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('JukeboxEngineService', () => {
  const made: Jukebox[] = [];

  function jukeboxCalled(identifier: string): Jukebox {
    const jukebox = new Jukebox(identifier);
    jukebox.initialize();
    made.push(jukebox);
    return jukebox;
  }

  function playbackOf(jukebox: Jukebox): unknown {
    return (jukebox as unknown as { playback: unknown }).playback;
  }

  beforeEach(() => TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] }));

  afterEach(() => {
    for (const jukebox of made.splice(0)) ObjectStore.instance.delete(jukebox, false);
    vi.restoreAllMocks();
  });

  it('puts an engine under a jukebox already in the room, and under one that comes in later', () => {
    const before = jukeboxCalled('Jukebox');
    TestBed.inject(JukeboxEngineService);
    const after = jukeboxCalled('Jukebox-later');

    expect(playbackOf(before)).toBeInstanceOf(JukeboxEngine);
    expect(playbackOf(after)).toBeInstanceOf(JukeboxEngine);
  });

  it('hands the engine of the room’s own jukebox what this peer’s hearing has to do', () => {
    TestBed.inject(JukeboxEngineService);
    jukeboxCalled('Jukebox');
    const refresh = vi.spyOn(JukeboxEngine.prototype, 'refreshMix').mockImplementation(() => {});
    const tick = vi.spyOn(JukeboxEngine.prototype, 'tickAutomix').mockImplementation(() => {});

    TestBed.inject(JukeboxEngineService).refreshMix();
    TestBed.inject(JukeboxEngineService).tickAutomix();

    expect(refresh).toHaveBeenCalledOnce();
    expect(tick).toHaveBeenCalledOnce();
  });
});
