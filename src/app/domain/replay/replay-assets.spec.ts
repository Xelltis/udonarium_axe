import { collectReplayAssetIds } from '@axe/domain/replay/replay-assets';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';

function event(overrides: Partial<ReplayEvent>): ReplayEvent {
  return {
    seq: 1,
    at: 1000,
    t: 1000,
    kind: ReplayEventKind.ObjectCreate,
    actorId: 'alice',
    detail: {},
    visibility: PUBLIC_VISIBILITY,
    ...overrides,
  };
}

describe('collectReplayAssetIds()', () => {
  it('finds the pictures and sounds on the board and in what changed', () => {
    const found = collectReplayAssetIds(
      [{ identifier: 'c1', aliasName: 'character', syncData: { attributes: { imageIdentifier: 'face' } } }],
      [
        event({
          patch: { identifier: 'j', aliasName: 'jukebox', before: {}, after: { audioIdentifier: 'bgm' } },
        }),
      ]
    );

    expect([...found.images]).toEqual(['face']);
    expect([...found.audios]).toEqual(['bgm']);
  });

  it('finds a picture named by a part that arrived with a piece', () => {
    const found = collectReplayAssetIds(
      [],
      [
        event({
          patch: { identifier: 'c2', aliasName: 'character', before: {}, after: {} },
          parts: [{ identifier: 'c2-face', aliasName: 'data', before: {}, after: { imageIdentifier: 'portrait' } }],
        }),
      ]
    );

    expect([...found.images]).toEqual(['portrait']);
  });

  it('adds the sound a sound effect played', () => {
    const found = collectReplayAssetIds(
      [],
      [event({ kind: ReplayEventKind.MediaSoundEffect, detail: { identifier: 'se' } })]
    );

    expect([...found.audios]).toEqual(['se']);
  });
});
