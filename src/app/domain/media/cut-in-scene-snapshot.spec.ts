import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { encodeCutInTracks } from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { cloneSceneSnapshot, restoreScene, snapshotScene } from '@axe/domain/media/cut-in-scene-snapshot';

describe('cut-in scene snapshots', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  function makeScene(): CutInScene {
    const scene = new CutInScene();
    scene.initialize();
    scene.cutInIdentifier = 'cut-1';
    return scene;
  }

  function addLayer(scene: CutInScene, name: string): CutInLayer {
    const layer = new CutInLayer();
    layer.initialize();
    layer.name = name;
    scene.appendChild(layer);
    return layer;
  }

  it('writes down nothing for no scene', () => {
    expect(snapshotScene(null).layers).toEqual([]);
  });

  it('writes down what the scene was told', () => {
    const scene = makeScene();
    scene.durationMs = 2500;
    scene.sceneLoop = true;
    scene.backgroundColor = '#101010';

    const snapshot = snapshotScene(scene);

    expect(snapshot).toMatchObject({ durationMs: 2500, sceneLoop: true, backgroundColor: '#101010' });
  });

  it('writes down each layer, in the order they are drawn', () => {
    const scene = makeScene();
    addLayer(scene, '下');
    addLayer(scene, '上');

    expect(snapshotScene(scene).layers.map((layer) => layer.name)).toEqual(['下', '上']);
  });

  it('copies deeply enough that the copy stands on its own', () => {
    const scene = makeScene();
    addLayer(scene, '立ち絵');
    const snapshot = snapshotScene(scene);

    const copy = cloneSceneSnapshot(snapshot);
    copy.layers[0].name = 'meddled with';

    expect(snapshot.layers[0].name).toBe('立ち絵');
  });

  describe('restoreScene()', () => {
    it('puts a value back', () => {
      const scene = makeScene();
      const layer = addLayer(scene, '立ち絵');
      const before = snapshotScene(scene);

      layer.x = 400;
      layer.rotation = 45;
      restoreScene(scene, before);

      expect(layer.x).toBe(0);
      expect(layer.rotation).toBe(0);
    });

    it('puts a deleted layer back with the identifier it had', () => {
      const scene = makeScene();
      const layer = addLayer(scene, '立ち絵');
      const identifier = layer.identifier;
      const before = snapshotScene(scene);

      layer.destroy();
      restoreScene(scene, before);

      expect(scene.layers).toHaveLength(1);
      expect(scene.layers[0].identifier).toBe(identifier);
      expect(scene.layers[0].name).toBe('立ち絵');
    });

    it('says a deleted layer is coming back before it is made again, as a room server would delete it again', () => {
      const scene = makeScene();
      const layer = addLayer(scene, 'gone');
      const kept = addLayer(scene, 'kept');
      const before = snapshotScene(scene);
      const identifier = layer.identifier;
      layer.destroy();
      const announce = vi.spyOn(store, 'announceComingBack');

      restoreScene(scene, before);

      expect(announce).toHaveBeenCalledWith([identifier]);
      expect(store.get(identifier)).not.toBeNull();
      expect(kept.parent).toBe(scene);
      announce.mockRestore();
    });

    it('takes an added layer away again', () => {
      const scene = makeScene();
      addLayer(scene, '立ち絵');
      const before = snapshotScene(scene);

      const added = addLayer(scene, '足したもの');
      restoreScene(scene, before);

      expect(scene.layers.map((layer) => layer.name)).toEqual(['立ち絵']);
      expect(store.get(added.identifier)).toBeNull();
    });

    it('puts the stack back the way round it was', () => {
      const scene = makeScene();
      const first = addLayer(scene, '一');
      const second = addLayer(scene, '二');
      const before = snapshotScene(scene);

      scene.appendChild(first);
      expect(scene.layers).toEqual([second, first]);

      restoreScene(scene, before);

      expect(scene.layers).toEqual([first, second]);
    });

    it('leaves the layers that did not change alone', () => {
      const scene = makeScene();
      const layer = addLayer(scene, '立ち絵');
      const before = snapshotScene(scene);

      restoreScene(scene, before);

      expect(scene.layers[0]).toBe(layer);
    });

    it('puts the keys back as they were', () => {
      const scene = makeScene();
      const layer = addLayer(scene, '立ち絵');
      layer.tracks = encodeCutInTracks({
        x: [
          { t: 0, v: 0 },
          { t: 500, v: 100 },
        ],
      });
      const before = snapshotScene(scene);

      layer.tracks = '';
      restoreScene(scene, before);

      expect(layer.trackSet.x).toHaveLength(2);
    });

    it('does nothing without a scene', () => {
      expect(() => restoreScene(null, snapshotScene(null))).not.toThrow();
    });
  });
});
