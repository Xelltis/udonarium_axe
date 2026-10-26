import { createScene, MapScene } from '@axe/domain/map-editor/scene';
import { collectSceneImageIds } from '@axe/infrastructure/map-editor/scene-archive-images';

function sceneWith(layers: MapScene['layers']): MapScene {
  return { ...createScene(), layers };
}

describe('collectSceneImageIds()', () => {
  it('picks up a pattern used to fill a cell', () => {
    const scene = sceneWith([
      {
        id: 'l1',
        kind: 'cell',
        name: '床',
        visible: true,
        locked: false,
        opacity: 1,
        cells: { '0,0': { type: 'texture', textureId: 'image:abc' } },
      } as unknown as MapScene['layers'][number],
    ]);

    expect([...collectSceneImageIds(scene).textureIds]).toEqual(['abc']);
  });

  it('picks up patterns from both the fill and the stroke of a shape', () => {
    const scene = sceneWith([
      {
        id: 'l1',
        kind: 'shape',
        name: '図形',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          {
            id: 's1',
            fill: { type: 'texture', textureId: 'image:fill' },
            stroke: { fill: { type: 'texture', textureId: 'image:line' } },
          },
        ],
      } as unknown as MapScene['layers'][number],
    ]);

    expect([...collectSceneImageIds(scene).textureIds].sort()).toEqual(['fill', 'line']);
  });

  it('counts a placed image apart from the patterns', () => {
    // Patterns are tagged in storage so they can be told apart, which changes how they are put back.
    const scene = sceneWith([
      {
        id: 'l1',
        kind: 'image',
        name: '絵',
        visible: true,
        locked: false,
        opacity: 1,
        items: [{ id: 'i1', imageIdentifier: 'picture-1' }],
      } as unknown as MapScene['layers'][number],
    ]);

    const ids = collectSceneImageIds(scene);
    expect([...ids.imageIds]).toEqual(['picture-1']);
    expect(ids.textureIds.size).toBe(0);
  });

  it('picks up nothing from a fill that uses no image', () => {
    const scene = sceneWith([
      {
        id: 'l1',
        kind: 'cell',
        name: '床',
        visible: true,
        locked: false,
        opacity: 1,
        cells: { '0,0': { type: 'solid', color: '#ff0000' } },
      } as unknown as MapScene['layers'][number],
    ]);

    expect(collectSceneImageIds(scene).textureIds.size).toBe(0);
  });
});
