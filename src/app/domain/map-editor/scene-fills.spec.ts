import { createScene, FillStyle, MapScene } from '@axe/domain/map-editor/scene';
import { forEachSceneFill } from '@axe/domain/map-editor/scene-fills';

function sceneWith(layers: MapScene['layers']): MapScene {
  return { ...createScene(), layers };
}

function fillsOf(scene: MapScene): FillStyle[] {
  const fills: FillStyle[] = [];
  forEachSceneFill(scene, (fill) => fills.push(fill));
  return fills;
}

describe('forEachSceneFill()', () => {
  it('visits the fill of every cell, and the fill and the stroke fill of every shape', () => {
    const scene = sceneWith([
      {
        id: 'cells',
        kind: 'cell',
        name: '床',
        visible: true,
        locked: false,
        opacity: 1,
        cells: { '0,0': { type: 'solid', color: '#111111' }, '1,0': { type: 'texture', textureId: 'image:abc' } },
      } as unknown as MapScene['layers'][number],
      {
        id: 'shapes',
        kind: 'shape',
        name: '図形',
        visible: false,
        locked: false,
        opacity: 1,
        items: [
          {
            id: 's1',
            fill: { type: 'solid', color: '#222222' },
            stroke: { fill: { type: 'solid', color: '#333333' } },
          },
          { id: 's2', fill: null, stroke: { color: '#444444' } },
        ],
      } as unknown as MapScene['layers'][number],
    ]);

    expect(fillsOf(scene)).toEqual([
      { type: 'solid', color: '#111111' },
      { type: 'texture', textureId: 'image:abc' },
      { type: 'solid', color: '#222222' },
      { type: 'solid', color: '#333333' },
    ]);
  });

  it('hands over the scene’s own fills, so one changed in the visit is changed in the scene', () => {
    const scene = sceneWith([
      {
        id: 'cells',
        kind: 'cell',
        name: '床',
        visible: true,
        locked: false,
        opacity: 1,
        cells: { '0,0': { type: 'texture', textureId: 'image:old' } },
      } as unknown as MapScene['layers'][number],
    ]);

    forEachSceneFill(scene, (fill) => {
      if (fill.type === 'texture') fill.textureId = 'image:new';
    });

    expect((scene.layers[0] as { cells: Record<string, FillStyle> }).cells['0,0']).toEqual({
      type: 'texture',
      textureId: 'image:new',
    });
  });

  it('visits nothing on a layer of another kind', () => {
    const scene = sceneWith([
      {
        id: 'images',
        kind: 'image',
        name: '絵',
        visible: true,
        locked: false,
        opacity: 1,
        items: [{ id: 'i1', imageIdentifier: 'picture-1' }],
      } as unknown as MapScene['layers'][number],
    ]);

    expect(fillsOf(scene)).toEqual([]);
  });
});
