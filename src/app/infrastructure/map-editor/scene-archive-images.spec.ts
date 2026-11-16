import type { ImageStorage } from '@axe/core/storage/image-storage';
import { createScene, MapScene } from '@axe/domain/map-editor/scene';
import { serializeScene } from '@axe/domain/map-editor/serialize';
import { packSceneArchive } from '@axe/infrastructure/map-editor/scene-archive';
import { collectSceneImageIds, unpackSceneWithImages } from '@axe/infrastructure/map-editor/scene-archive-images';

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

describe('unpackSceneWithImages()', () => {
  /** A store that takes every picture in, naming each by the type it came as. */
  function storeTakingAll() {
    const added: Blob[] = [];
    const storage = {
      addAsync: vi.fn(async (blob: Blob) => {
        added.push(blob);
        return { identifier: `kept-${blob.type}` };
      }),
    } as unknown as ImageStorage;
    return { storage, added };
  }

  function sceneShowing(imageIdentifier: string): MapScene {
    return sceneWith([
      {
        id: 'l1',
        kind: 'image',
        name: '絵',
        visible: true,
        locked: false,
        opacity: 1,
        items: [{ id: 'i1', imageIdentifier }],
      } as unknown as MapScene['layers'][number],
    ]);
  }

  it('puts a picture back as the kind of picture its bytes are, which the archive does not say', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const archive = packSceneArchive(serializeScene(sceneShowing('pic')), {}, { pic: png });
    const { storage, added } = storeTakingAll();

    const scene = await unpackSceneWithImages(archive, storage);

    expect(added.map((blob) => blob.type)).toEqual(['image/png']);
    const layer = scene?.layers[0] as { items: { imageIdentifier: string }[] };
    expect(layer.items[0].imageIdentifier).toBe('kept-image/png');
  });

  it('takes bytes that begin like no known picture as webp, as every archive once was', async () => {
    const unknown = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const archive = packSceneArchive(serializeScene(sceneShowing('pic')), {}, { pic: unknown });
    const { storage, added } = storeTakingAll();

    await unpackSceneWithImages(archive, storage);

    expect(added.map((blob) => blob.type)).toEqual(['image/webp']);
  });
});
