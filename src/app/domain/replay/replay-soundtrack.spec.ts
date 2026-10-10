import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  buildReplaySoundtrack,
  collectSoundtrackAssetIds,
  EMPTY_REPLAY_SOUNDTRACK,
  hasReplaySound,
  REPLAY_BGM_GAIN,
  REPLAY_BGS_FADE_MS,
  REPLAY_BGS_GAIN,
  REPLAY_SE_GAIN,
} from '@axe/domain/replay/replay-soundtrack';
import type { ReplayStoryboard } from '@axe/domain/replay/replay-storyboard';

function event(
  seq: number,
  kind: ReplayEventKind,
  detail: Record<string, unknown> = {},
  targetId?: string
): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind,
    actorId: 'alice',
    targetId,
    detail,
    visibility: PUBLIC_VISIBILITY,
  };
}

function storyboard(times: [number, number][], totalMs: number): ReplayStoryboard {
  return { shots: [], totalMs, timeOfSeq: new Map(times) };
}

describe('buildReplaySoundtrack()', () => {
  it('places a sound effect at the moment of its scene', () => {
    const track = buildReplaySoundtrack(
      [event(1, ReplayEventKind.MediaSoundEffect, { identifier: 'se-1' })],
      storyboard([[1, 2500]], 10_000)
    );

    expect(track.effects).toEqual([{ audioIdentifier: 'se-1', startMs: 2500, offsetMs: 0, gain: REPLAY_SE_GAIN }]);
  });

  it('throws away one whose sound it does not know', () => {
    const track = buildReplaySoundtrack(
      [event(1, ReplayEventKind.MediaSoundEffect, { identifier: '' })],
      storyboard([[1, 0]], 10_000)
    );

    expect(track.effects).toEqual([]);
  });

  it('runs the music from where it starts to where it stops', () => {
    const track = buildReplaySoundtrack(
      [
        event(1, ReplayEventKind.MediaBgm, { isPlaying: true, startTime: 12 }, 'bgm-1'),
        event(2, ReplayEventKind.MediaBgm, { isPlaying: false }, 'bgm-1'),
      ],
      storyboard(
        [
          [1, 1000],
          [2, 6000],
        ],
        10_000
      )
    );

    expect(track.music).toEqual([
      {
        audioIdentifier: 'bgm-1',
        startMs: 1000,
        endMs: 6000,
        offsetMs: 12_000,
        gain: REPLAY_BGM_GAIN,
        fadeMs: expect.any(Number),
      },
    ]);
  });

  it('carries music left playing through to the end', () => {
    const track = buildReplaySoundtrack(
      [event(1, ReplayEventKind.MediaBgm, { isPlaying: true }, 'bgm-1')],
      storyboard([[1, 1000]], 10_000)
    );

    expect(track.music[0]).toMatchObject({ startMs: 1000, endMs: 10_000 });
  });

  it('cuts the previous track when the music changes', () => {
    const track = buildReplaySoundtrack(
      [
        event(1, ReplayEventKind.MediaBgm, { isPlaying: true }, 'bgm-1'),
        event(2, ReplayEventKind.MediaBgm, { isPlaying: true }, 'bgm-2'),
      ],
      storyboard(
        [
          [1, 0],
          [2, 4000],
        ],
        10_000
      )
    );

    expect(track.music.map((cue) => [cue.audioIdentifier, cue.startMs, cue.endMs])).toEqual([
      ['bgm-1', 0, 4000],
      ['bgm-2', 4000, 10_000],
    ]);
  });

  it('lays background sounds over the music and one another, each from its start to its stop', () => {
    const track = buildReplaySoundtrack(
      [
        event(1, ReplayEventKind.MediaBgm, { isPlaying: true }, 'bgm-1'),
        event(2, ReplayEventKind.MediaBackgroundSound, { isPlaying: true, volume: 1 }, 'rain'),
        event(3, ReplayEventKind.MediaBackgroundSound, { isPlaying: true, volume: 0.5 }, 'fire'),
        event(4, ReplayEventKind.MediaBgm, { isPlaying: true }, 'bgm-2'),
        event(5, ReplayEventKind.MediaBackgroundSound, { isPlaying: false, volume: 1 }, 'rain'),
      ],
      storyboard(
        [
          [1, 0],
          [2, 1000],
          [3, 2000],
          [4, 3000],
          [5, 5000],
        ],
        10_000
      )
    );

    expect(track.music.map((cue) => [cue.audioIdentifier, cue.startMs, cue.endMs])).toEqual([
      ['bgm-1', 0, 3000],
      ['rain', 1000, 5000],
      ['bgm-2', 3000, 10_000],
      ['fire', 2000, 10_000],
    ]);
    const fire = track.music.find((cue) => cue.audioIdentifier === 'fire')!;
    expect(fire.gain).toBeCloseTo(REPLAY_BGS_GAIN * 0.5);
    expect(fire.fadeMs).toBe(REPLAY_BGS_FADE_MS);
  });

  it('starts a background sound afresh once it was stopped and started again', () => {
    const track = buildReplaySoundtrack(
      [
        event(1, ReplayEventKind.MediaBackgroundSound, { isPlaying: true }, 'rain'),
        event(2, ReplayEventKind.MediaBackgroundSound, { isPlaying: false }, 'rain'),
        event(3, ReplayEventKind.MediaBackgroundSound, { isPlaying: true, volume: 0.2 }, 'rain'),
      ],
      storyboard(
        [
          [1, 0],
          [2, 2000],
          [3, 6000],
        ],
        10_000
      )
    );

    expect(track.music.map((cue) => [cue.startMs, cue.endMs, cue.gain])).toEqual([
      [0, 2000, REPLAY_BGS_GAIN],
      [6000, 10_000, expect.closeTo(REPLAY_BGS_GAIN * 0.2)],
    ]);
  });

  it('leaves the background sounds out with the music', () => {
    const track = buildReplaySoundtrack(
      [event(1, ReplayEventKind.MediaBackgroundSound, { isPlaying: true }, 'rain')],
      storyboard([[1, 0]], 10_000),
      { withEffects: true, withMusic: false }
    );

    expect(track.music).toEqual([]);
  });

  it('keeps no stretch of no length', () => {
    const track = buildReplaySoundtrack(
      [
        event(1, ReplayEventKind.MediaBgm, { isPlaying: true }, 'bgm-1'),
        event(2, ReplayEventKind.MediaBgm, { isPlaying: false }, 'bgm-1'),
      ],
      storyboard(
        [
          [1, 3000],
          [2, 3000],
        ],
        10_000
      )
    );

    expect(track.music).toEqual([]);
  });

  it('sounds nothing for an event the storyboard leaves out', () => {
    const track = buildReplaySoundtrack(
      [event(9, ReplayEventKind.MediaSoundEffect, { identifier: 'se-1' })],
      storyboard([[1, 0]], 10_000)
    );

    expect(track.effects).toEqual([]);
  });

  it('sounds nothing past the end', () => {
    const track = buildReplaySoundtrack(
      [event(1, ReplayEventKind.MediaSoundEffect, { identifier: 'se-1' })],
      storyboard([[1, 10_000]], 10_000)
    );

    expect(track.effects).toEqual([]);
  });

  it('makes no sound for a recording with no picture', () => {
    expect(
      buildReplaySoundtrack([event(1, ReplayEventKind.MediaSoundEffect, { identifier: 'se-1' })], storyboard([], 0))
    ).toBe(EMPTY_REPLAY_SOUNDTRACK);
  });
});

describe('collectSoundtrackAssetIds() / hasReplaySound()', () => {
  const track = buildReplaySoundtrack(
    [
      event(1, ReplayEventKind.MediaSoundEffect, { identifier: 'se-1' }),
      event(2, ReplayEventKind.MediaBgm, { isPlaying: true }, 'bgm-1'),
    ],
    storyboard(
      [
        [1, 0],
        [2, 1000],
      ],
      10_000
    )
  );

  it('returns the sounds together', () => {
    expect(collectSoundtrackAssetIds(track)).toEqual(['se-1', 'bgm-1']);
  });

  it('says whether there is anything to sound', () => {
    expect(hasReplaySound(track)).toBe(true);
    expect(hasReplaySound(EMPTY_REPLAY_SOUNDTRACK)).toBe(false);
  });
});
