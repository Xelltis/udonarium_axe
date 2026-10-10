import {
  cutInScenesOf,
  replaySampleAt,
  replaySceneDurationOf,
  sceneImageIdentifiers,
} from '@axe/domain/replay/replay-cut-in-scene';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

function scene(identifier: string, attributes: Record<string, unknown> = {}): ReplayObjectSnapshot {
  return {
    identifier,
    aliasName: 'cut-in-scene',
    syncData: { attributes: { cutInIdentifier: 'cut-1', durationMs: 3000, ...attributes } },
  };
}

function layer(
  identifier: string,
  parentIdentifier: string,
  attributes: Record<string, unknown> = {},
  index = 0
): ReplayObjectSnapshot {
  return {
    identifier,
    aliasName: 'cut-in-layer',
    syncData: {
      parentIdentifier,
      majorIndex: index,
      minorIndex: 0,
      attributes: { kind: 'image', width: 320, height: 180, ...attributes },
    },
  };
}

describe('cutInScenesOf()', () => {
  it('finds nothing in a recording that has none', () => {
    expect(cutInScenesOf([])).toEqual(new Map());
    expect(cutInScenesOf([{ identifier: 'x', aliasName: 'cut-in', syncData: {} }]).size).toBe(0);
  });

  it('finds nothing for a scene with no layers', () => {
    expect(cutInScenesOf([scene('scene-1')]).size).toBe(0);
  });

  it('keys the scene by the cut-in it belongs to', () => {
    const found = cutInScenesOf([scene('scene-1'), layer('layer-1', 'scene-1')]);

    expect([...found.keys()]).toEqual(['cut-1']);
    expect(found.get('cut-1')?.durationMs).toBe(3000);
  });

  it('puts the layers in the order they are drawn', () => {
    const found = cutInScenesOf([
      scene('scene-1'),
      layer('layer-2', 'scene-1', { name: '上' }, 5),
      layer('layer-1', 'scene-1', { name: '下' }, 1),
    ]);

    expect(found.get('cut-1')?.layers.map((each) => each.width)).toHaveLength(2);
    expect(found.get('cut-1')?.layers[0].x).toBe(0);
  });

  it('leaves out a layer belonging to no scene it knows', () => {
    const found = cutInScenesOf([scene('scene-1'), layer('layer-1', 'scene-1'), layer('stray', 'gone')]);

    expect(found.get('cut-1')?.layers).toHaveLength(1);
  });

  it('reads the keys a layer was given', () => {
    const found = cutInScenesOf([
      scene('scene-1'),
      layer('layer-1', 'scene-1', { tracks: '{"x":[{"t":0,"v":-400},{"t":600,"v":0}]}' }),
    ]);

    expect(found.get('cut-1')?.layers[0].tracks.x).toHaveLength(2);
  });

  it('falls back on anything it cannot read', () => {
    const found = cutInScenesOf([
      scene('scene-1', { durationMs: 'soon' }),
      layer('layer-1', 'scene-1', { x: 'over there' }),
    ]);

    expect(found.get('cut-1')?.durationMs).toBe(3000);
    expect(found.get('cut-1')?.layers[0].x).toBe(0);
  });
});

describe('replaySceneDurationOf()', () => {
  const found = (extra: Record<string, unknown> = {}, sceneAttributes: Record<string, unknown> = {}) =>
    cutInScenesOf([scene('scene-1', sceneAttributes), layer('layer-1', 'scene-1', extra)]).get('cut-1')!;

  it('runs as long as it was told', () => {
    expect(replaySceneDurationOf(found())).toBe(3000);
  });

  it('never runs shorter than the layer that finishes last', () => {
    expect(replaySceneDurationOf(found({ tracks: '{"opacity":[{"t":5200,"v":0}]}' }))).toBe(5200);
  });

  it('runs long enough to reach a layer that comes in after the end', () => {
    // The window the cut-in is played in runs to the last moment any layer holds, and the
    // moment one comes in is one of them. Exported shorter, the layer would never appear at all.
    expect(replaySceneDurationOf(found({ startMs: 4000 }))).toBe(4000);
  });

  it('stays inside what a scene may last', () => {
    expect(replaySceneDurationOf(found({}, { durationMs: 1 }))).toBe(100);
  });
});

describe('replaySampleAt()', () => {
  const found = (extra: Record<string, unknown> = {}) =>
    cutInScenesOf([scene('scene-1'), layer('layer-1', 'scene-1', extra)]).get('cut-1')!.layers[0];

  it('rests where the layer was put', () => {
    const sample = replaySampleAt(found({ x: 40, rotation: 15 }), 0, 3000);

    expect(sample.x).toBe(40);
    expect(sample.rotation).toBe(15);
    expect(sample.visible).toBe(true);
  });

  it('follows the track between two keys', () => {
    const sample = replaySampleAt(
      found({ tracks: '{"x":[{"t":0,"v":0,"e":"linear"},{"t":1000,"v":200}]}' }),
      500,
      3000
    );

    expect(sample.x).toBeCloseTo(100, 5);
  });

  it('is out of sight outside the time the layer is on screen', () => {
    const layerRead = found({ startMs: 400, endMs: 900 });

    expect(replaySampleAt(layerRead, 200, 3000).visible).toBe(false);
    expect(replaySampleAt(layerRead, 500, 3000).visible).toBe(true);
    expect(replaySampleAt(layerRead, 900, 3000).visible).toBe(false);
  });

  it('is out of sight while the layer is turned off', () => {
    expect(replaySampleAt(found({ hidden: true }), 0, 3000).visible).toBe(false);
  });
});

describe('sceneImageIdentifiers()', () => {
  it('gathers the picture of every layer that has one', () => {
    const found = cutInScenesOf([
      scene('scene-1'),
      layer('layer-1', 'scene-1', { imageIdentifier: 'image-a' }, 0),
      layer('layer-2', 'scene-1', { kind: 'text' }, 1),
    ]).get('cut-1')!;

    expect(sceneImageIdentifiers(found)).toEqual(['image-a']);
  });
});
