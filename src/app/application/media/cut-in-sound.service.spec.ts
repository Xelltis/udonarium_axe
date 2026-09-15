import { TestBed } from '@angular/core/testing';
import { type CutInSoundHandle, CutInSoundService } from '@axe/application/media/cut-in-sound.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { encodeCutInSounds } from '@axe/domain/media/cut-in-sound';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInSoundService', () => {
  let service: CutInSoundService;
  let played: AudioFile[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });

    played = [];
    vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation((audio?: AudioFile) => {
      if (audio) played.push(audio);
    });
    vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
    vi.useFakeTimers();

    AudioStorage.instance.add(AudioFile.createEmpty('se-1'));
    AudioStorage.instance.add(AudioFile.createEmpty('se-2'));
    service = TestBed.inject(CutInSoundService);
  });

  afterEach(() => {
    service.stopAll();
    vi.useRealTimers();
    vi.restoreAllMocks();
    AudioStorage.instance.audios.forEach((audio) => AudioStorage.instance.delete(audio.identifier));
  });

  /** The player one run of a scene made for a sound, of which each run has its own. */
  function playerFor(identifier: string): AudioPlayer | undefined {
    const sessions = (service as unknown as { sessions: Set<{ players: Map<string, AudioPlayer> }> }).sessions;
    for (const session of sessions) {
      const player = session.players.get(identifier);
      if (player) return player;
    }
    return undefined;
  }

  /** How many players are told to stop from here on. */
  function stopsCounted(): () => number {
    let stops = 0;
    vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {
      stops++;
    });
    return () => stops;
  }

  function makeScene(sounds: { t: number; a: string; v: number }[], durationMs = 2000): CutInScene {
    const scene = new CutInScene();
    scene.initialize();
    scene.durationMs = durationMs;
    scene.sounds = encodeCutInSounds(sounds);
    const layer = new CutInLayer();
    layer.initialize();
    scene.appendChild(layer);
    return scene;
  }

  function play(scene: CutInScene | null, fromMs = 0, loop = false): CutInSoundHandle {
    return service.play(scene, fromMs, loop);
  }

  it('plays nothing without a scene', () => {
    play(null);
    vi.advanceTimersByTime(5000);

    expect(played).toHaveLength(0);
  });

  it('plays each sound where it falls', () => {
    play(
      makeScene([
        { t: 0, a: 'se-1', v: 100 },
        { t: 800, a: 'se-2', v: 50 },
      ])
    );

    vi.advanceTimersByTime(0);
    expect(played.map((audio) => audio.identifier)).toEqual(['se-1']);

    vi.advanceTimersByTime(800);
    expect(played.map((audio) => audio.identifier)).toEqual(['se-1', 'se-2']);
  });

  it('leaves behind what the clock has already passed', () => {
    play(
      makeScene([
        { t: 0, a: 'se-1', v: 100 },
        { t: 800, a: 'se-2', v: 100 },
      ]),
      400
    );

    vi.advanceTimersByTime(2000);

    expect(played.map((audio) => audio.identifier)).toEqual(['se-2']);
  });

  it('plays them at the volume for effects', () => {
    play(makeScene([{ t: 0, a: 'se-1', v: 100 }]));
    vi.advanceTimersByTime(0);

    expect(playerFor('se-1')?.volumeType).toBe(VolumeType.SE);
  });

  it('turns a quiet sound down', () => {
    play(makeScene([{ t: 0, a: 'se-1', v: 40 }]));
    vi.advanceTimersByTime(0);

    expect(playerFor('se-1')?.volume).toBeCloseTo(0.4, 5);
  });

  it('says nothing for a sound the room no longer has', () => {
    play(makeScene([{ t: 0, a: 'gone', v: 100 }]));
    vi.advanceTimersByTime(100);

    expect(played).toHaveLength(0);
  });

  it('lays them out again each time a scene comes round', () => {
    play(makeScene([{ t: 100, a: 'se-1', v: 100 }], 1000), 0, true);

    vi.advanceTimersByTime(100);
    expect(played).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(played).toHaveLength(2);
  });

  it('runs a scene once where it was not told to repeat', () => {
    play(makeScene([{ t: 100, a: 'se-1', v: 100 }], 1000));

    vi.advanceTimersByTime(5000);

    expect(played).toHaveLength(1);
  });

  it('says nothing more once it is stopped', () => {
    const handle = play(makeScene([{ t: 500, a: 'se-1', v: 100 }]));

    handle.stop();
    vi.advanceTimersByTime(2000);

    expect(played).toHaveLength(0);
  });

  it('leaves the other scene going when one of them is stopped', () => {
    // Closing one cut-in must leave the timers of anything else just set going, or re-firing
    // one that is already up leaves the new window silent.
    const first = play(makeScene([{ t: 500, a: 'se-1', v: 100 }]));
    play(makeScene([{ t: 500, a: 'se-2', v: 100 }]));

    first.stop();
    vi.advanceTimersByTime(600);

    expect(played.map((audio) => audio.identifier)).toEqual(['se-2']);
  });

  it('gives each scene a player of its own, so stopping one silences only that one', () => {
    const first = play(makeScene([{ t: 0, a: 'se-1', v: 100 }]));
    play(makeScene([{ t: 0, a: 'se-1', v: 100 }]));
    vi.advanceTimersByTime(0);
    const stopped = stopsCounted();

    first.stop();

    expect(played).toHaveLength(2);
    expect(stopped()).toBe(1);
  });

  it('silences every scene at once when the room goes quiet', () => {
    play(makeScene([{ t: 500, a: 'se-1', v: 100 }]));
    play(makeScene([{ t: 500, a: 'se-2', v: 100 }]));

    service.stopAll();
    vi.advanceTimersByTime(600);

    expect(played).toHaveLength(0);
  });
});
