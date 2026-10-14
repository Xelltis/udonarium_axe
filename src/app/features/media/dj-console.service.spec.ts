import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import { AUDIO_ANALYSIS_VERSION, type AudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { DEFAULT_DJ_SETTINGS } from '@axe/domain/media/dj-settings';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DjConsoleService, EFFECTS_SHARE_MS, TAPS_TO_SET_TEMPO } from '@axe/features/media/dj-console.service';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const reading: AudioAnalysis = {
  version: AUDIO_ANALYSIS_VERSION,
  duration: 200,
  lufs: -10,
  peak: -1,
  start: 0,
  end: 200,
  bpm: 100,
  bar: 0.2,
  confidence: 0.9,
};

describe('DjConsoleService', () => {
  let dj: DjConsoleService;
  let jukebox: Jukebox;
  let position: number;
  let now: number;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: AudioAnalysisService,
          useValue: { version: signal(0), reading: signal(''), isPending: () => false },
        },
      ],
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    jukebox.audioIdentifier = 'track';
    if (!ObjectStore.instance.get<Config>('Config')) new Config('Config').initialize();
    position = 0;
    now = 10_000;
    vi.spyOn(Jukebox.prototype, 'position', 'get').mockImplementation(() => position);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(Jukebox.prototype, 'refreshMix').mockImplementation(() => {});
    dj = TestBed.inject(DjConsoleService);
  });

  afterEach(() => vi.restoreAllMocks());

  function tapAt(seconds: number): void {
    now = 10_000 + seconds * 1000;
    position = seconds;
    dj.tap();
  }

  it('reads the room track and its beats', () => {
    AudioProfile.share('track', reading);

    expect(dj.track()).toBe('track');
    expect(dj.trackAnalysis()?.lufs).toBe(-10);
    expect(dj.grid()).toEqual({ bpm: 100, bar: 0.2 });
    expect(dj.isGridManual()).toBe(false);
    expect(dj.levelDb()).toBeCloseTo(-6, 6);
  });

  it('counts out where the track stands against its beats', () => {
    AudioProfile.share('track', reading);
    position = 0.2 + 0.6 * 2 + 0.15;

    expect(dj.beatClock()).toEqual({ beat: 2, beatOfBar: 2, fraction: expect.closeTo(0.25, 6) });
  });

  it('sets the tempo from the fourth tap, a bar starting at the last tap when the track had no beats', async () => {
    for (const at of [1, 1.5, 2]) tapAt(at);
    await waitZeroTimeout();
    expect(dj.grid()).toBeNull();
    expect(dj.tappedBpm()).toBeCloseTo(120, 6);

    tapAt(2.5);
    await waitZeroTimeout();

    expect(TAPS_TO_SET_TEMPO).toBe(4);
    expect(dj.grid()).toEqual({ bpm: 120, bar: expect.closeTo(0.5, 6) });
    expect(dj.isGridManual()).toBe(true);
  });

  it('keeps which beat of the bar the taps fall on when the track had beats', async () => {
    AudioProfile.share('track', reading);
    const thirdBeatOfABar = 0.2 + 0.6 * 10;
    for (const offset of [-1.5, -1, -0.5, 0]) tapAt(thirdBeatOfABar + offset);
    await waitZeroTimeout();

    const grid = dj.grid()!;
    expect(grid.bpm).toBeCloseTo(120, 6);
    const beatsFromBar = ((((thirdBeatOfABar - grid.bar) / 0.5) % 4) + 4) % 4;
    expect(beatsFromBar).toBeCloseTo(2, 6);
  });

  it('doubles and halves the tempo, keeping the bar', async () => {
    AudioProfile.share('track', reading);

    dj.doubleTempo();
    await waitZeroTimeout();
    expect(dj.grid()).toEqual({ bpm: 200, bar: 0.2 });

    dj.halveTempo();
    await waitZeroTimeout();
    dj.halveTempo();
    await waitZeroTimeout();
    expect(dj.grid()).toEqual({ bpm: 50, bar: 0.2 });
  });

  it('starts a bar where the track is now, and goes back to the reading', async () => {
    AudioProfile.share('track', reading);
    position = 10.1;

    dj.setDownbeatHere();
    await waitZeroTimeout();
    expect(dj.grid()).toEqual({ bpm: 100, bar: expect.closeTo(0.5, 6) });

    dj.resetGrid();
    await waitZeroTimeout();
    expect(dj.grid()).toEqual({ bpm: 100, bar: 0.2 });
    expect(dj.isGridManual()).toBe(false);
  });

  it('lets a guest change none of the beats', async () => {
    AudioProfile.share('track', reading);
    PeerCursor.myCursor.role = PeerRole.Guest;

    for (const at of [1, 1.5, 2, 2.5]) tapAt(at);
    dj.doubleTempo();
    dj.setDownbeatHere();
    await waitZeroTimeout();

    expect(dj.canOperate()).toBe(false);
    expect(dj.grid()).toEqual({ bpm: 100, bar: 0.2 });
  });

  it('lets the game master alone change how the room mixes', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    dj.setSettings({ ducking: false });
    expect(Config.instance.djSettings).toEqual(DEFAULT_DJ_SETTINGS);
    expect(dj.canChangeSettings()).toBe(false);

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    dj.setSettings({ ducking: false });
    expect(Config.instance.djSettings.ducking).toBe(false);
    expect(jukebox.refreshMix).toHaveBeenCalled();
  });

  it('turns no level while the room does not level', () => {
    AudioProfile.share('track', reading);
    Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, autoLevel: false };

    expect(dj.levelDb()).toBe(0);
  });

  describe('effects', () => {
    it('lets the room hear a knob as it turns, shares it at most every tenth of a second, and at once when it settles', () => {
      vi.useFakeTimers();
      try {
        const heard = vi.spyOn(jukebox, 'applyEffects').mockImplementation(() => {});
        const shared = vi.spyOn(jukebox, 'setEffects');

        dj.setEffect('filter', -0.2);
        dj.setEffect('filter', -0.4);
        expect(heard).toHaveBeenLastCalledWith({ filter: -0.4, echo: 0, reverb: 0 });
        expect(dj.effects().filter).toBe(-0.4);
        expect(shared).not.toHaveBeenCalled();

        vi.advanceTimersByTime(EFFECTS_SHARE_MS);
        expect(shared).toHaveBeenCalledOnce();
        expect(JSON.parse(jukebox.fx ?? '')).toEqual({ filter: -0.4 });

        dj.setEffect('echo', 0.5, true);
        expect(shared).toHaveBeenCalledTimes(2);
        expect(JSON.parse(jukebox.fx ?? '')).toEqual({ filter: -0.4, echo: 0.5 });
      } finally {
        vi.useRealTimers();
      }
    });

    it('turns every effect off at once', () => {
      vi.spyOn(jukebox, 'applyEffects').mockImplementation(() => {});
      jukebox.fx = '{"reverb":0.3}';

      dj.resetEffects();

      expect(jukebox.fx).toBe('');
    });

    it('lets a guest turn no effect and brake nothing', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      const brake = vi.spyOn(jukebox, 'brakeStop').mockImplementation(() => {});

      dj.setEffect('reverb', 1, true);
      dj.brakeStop();

      expect(jukebox.fx ?? '').toBe('');
      expect(brake).not.toHaveBeenCalled();
    });
  });

  describe('cues', () => {
    it('marks the place the track is at in an empty slot, and jumps the room to a slot holding one', async () => {
      const jump = vi.spyOn(jukebox, 'jumpTo').mockImplementation(() => {});
      position = 42.3;

      dj.pressCue(1);
      await waitZeroTimeout();
      expect(dj.cues()).toEqual([null, 42.3, null, null]);
      expect(jump).not.toHaveBeenCalled();

      dj.pressCue(1);
      expect(jump).toHaveBeenCalledWith(42.3);
    });

    it('puts a mark on the nearest beat while the room quantises', async () => {
      AudioProfile.share('track', reading);
      Config.instance.djSettings = { ...DEFAULT_DJ_SETTINGS, quantize: true };
      position = 0.2 + 0.6 * 7 + 0.25;

      dj.pressCue(0);
      await waitZeroTimeout();

      expect(dj.cues()[0]).toBeCloseTo(0.2 + 0.6 * 7, 6);
    });

    it('builds each change on the one before, though the signals have yet to catch up', () => {
      AudioProfile.setCues('track', [10, 20, 30, null]);

      dj.clearCue(0);
      dj.clearCue(1);
      position = 5;
      dj.pressCue(3);

      expect(AudioProfile.cuesOf('track')).toEqual([null, null, 30, 5]);
    });

    it('empties a slot, and lets a guest neither mark nor empty one', async () => {
      AudioProfile.setCues('track', [10, 20, null, null]);
      dj.clearCue(0);
      await waitZeroTimeout();
      expect(dj.cues()).toEqual([null, 20, null, null]);

      PeerCursor.myCursor.role = PeerRole.Guest;
      const jump = vi.spyOn(jukebox, 'jumpTo').mockImplementation(() => {});
      dj.clearCue(1);
      dj.pressCue(2);
      dj.pressCue(1);
      await waitZeroTimeout();
      expect(dj.cues()).toEqual([null, 20, null, null]);
      expect(jump).not.toHaveBeenCalled();
    });
  });

  describe('pads', () => {
    it('lets the game master alone give a pad a sound or empty it', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      dj.assignPad(0, 'airhorn');
      expect(Config.instance.djPads[0]).toBe('');

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      dj.assignPad(0, 'airhorn');
      await waitZeroTimeout();
      expect(dj.pads()[0]).toEqual({ slot: 0, identifier: 'airhorn', name: '', kind: 'music', ready: false });

      dj.clearPad(0);
      expect(Config.instance.djPads[0]).toBe('');
    });

    it('sets off nothing for a pad whose sound is not on this device', () => {
      Config.instance.djPads = ['missing', '', '', '', '', '', '', ''];
      const play = vi.spyOn(TestBed.inject(JukeboxPlaybackService), 'play').mockImplementation(() => {});

      dj.firePad(0);
      dj.firePad(5);

      expect(play).not.toHaveBeenCalled();
    });
  });
});
