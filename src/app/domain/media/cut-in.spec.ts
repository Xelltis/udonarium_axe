import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CUT_IN_TITLE_BAR_HEIGHT, CutIn, cutInPanelChrome } from '@axe/domain/media/cut-in';
import { encodeCutInTracks } from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';

describe('CutIn', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  describe('the defaults of the synchronised fields', () => {
    let cutIn: CutIn;

    beforeEach(() => {
      cutIn = new CutIn();
      cutIn.initialize();
    });

    it('starts with the default name', () => {
      expect(cutIn.name).toBe('カットイン');
    });

    it('starts at the default width', () => {
      expect(cutIn.width).toBe(480);
    });

    it('starts at the default height', () => {
      expect(cutIn.height).toBe(320);
    });

    it('starts at its original size', () => {
      expect(cutIn.originalSize).toBe(true);
    });

    it('starts halfway across', () => {
      expect(cutIn.x_pos).toBe(50);
    });

    it('starts halfway down', () => {
      expect(cutIn.y_pos).toBe(50);
    });

    it('starts without looping', () => {
      expect(cutIn.isLoop).toBe(false);
    });

    it('starts without the chat trigger', () => {
      expect(cutIn.chatActivate).toBe(false);
    });

    it('starts stopped', () => {
      expect(cutIn.isPlaying).toBe(false);
    });

    it('starts as something other than a video', () => {
      expect(cutIn.isVideoCutIn).toBe(false);
    });

    it('starts with no address', () => {
      expect(cutIn.videoUrl).toBe('');
    });

    it('starts at half volume', () => {
      expect(cutIn.videoVolume).toBe(50);
    });

    it('starts wearing a frame', () => {
      expect(cutIn.frameless).toBe(false);
    });
  });

  describe('cutInPanelChrome()', () => {
    let cutIn: CutIn;

    beforeEach(() => {
      cutIn = new CutIn();
      cutIn.initialize();
    });

    it('leaves room for the title bar of a framed cut-in', () => {
      expect(cutInPanelChrome(cutIn)).toBe(CUT_IN_TITLE_BAR_HEIGHT);
    });

    it('leaves no room above a frameless one', () => {
      cutIn.frameless = true;
      expect(cutInPanelChrome(cutIn)).toBe(0);
    });
  });

  describe('minSize / maxSize', () => {
    let cutIn: CutIn;

    beforeEach(() => {
      cutIn = new CutIn();
      cutIn.initialize();
    });

    it('the narrowest an ordinary cut-in may be', () => {
      expect(cutIn.minSizeWidth(false)).toBe(10);
    });

    it('the widest', () => {
      expect(cutIn.maxSizeWidth(false)).toBe(1200);
    });

    it('the narrowest a video may be', () => {
      expect(cutIn.minSizeWidth(true)).toBe(448);
    });

    it('the widest', () => {
      expect(cutIn.maxSizeWidth(true)).toBe(1920);
    });

    it('the shortest an ordinary cut-in may be', () => {
      expect(cutIn.minSizeHeight(false)).toBe(10);
    });

    it('the shortest a video may be', () => {
      expect(cutIn.minSizeHeight(true)).toBe(252);
    });

    it('the tallest an ordinary cut-in may be', () => {
      expect(cutIn.maxSizeHeight(false)).toBe(1200);
    });

    it('the tallest a video may be', () => {
      expect(cutIn.maxSizeHeight(true)).toBe(1080);
    });
  });

  describe('defVideoSize', () => {
    it('the default width of a video', () => {
      const cutIn = new CutIn();
      cutIn.initialize();
      expect(cutIn.defVideoSizeWidth).toBe(640);
    });

    it('its default height', () => {
      const cutIn = new CutIn();
      cutIn.initialize();
      expect(cutIn.defVideoSizeHeight).toBe(360);
    });
  });

  describe('validUrl()', () => {
    let cutIn: CutIn;

    beforeEach(() => {
      cutIn = new CutIn();
      cutIn.initialize();
    });

    it('is true for a secure address', () => {
      expect(cutIn.validUrl('https://example.com')).toBe(true);
    });

    it('is true for a plain one', () => {
      expect(cutIn.validUrl('http://example.com')).toBe(true);
    });

    it('is false for an empty string', () => {
      expect(cutIn.validUrl('')).toBe(false);
    });

    it('is false for another scheme', () => {
      expect(cutIn.validUrl('ftp://example.com')).toBe(false);
    });

    it('is false for an address it cannot read', () => {
      expect(cutIn.validUrl('not a url')).toBe(false);
    });
  });

  describe('videoId', () => {
    let cutIn: CutIn;

    beforeEach(() => {
      cutIn = new CutIn();
      cutIn.initialize();
    });

    it('returns nothing for a cut-in that is not a video', () => {
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(cutIn.videoId).toBe('');
    });

    it('takes the identifier out of a full address', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(cutIn.videoId).toBe('dQw4w9WgXcQ');
    });

    it('takes it out of a shortened one', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://youtu.be/dQw4w9WgXcQ';
      expect(cutIn.videoId).toBe('dQw4w9WgXcQ');
    });

    it('returns nothing for an empty address', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = '';
      expect(cutIn.videoId).toBe('');
    });

    it('returns nothing for another host', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://vimeo.com/123456';
      expect(cutIn.videoId).toBe('');
    });

    it('takes it out of a short-form address', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
      expect(cutIn.videoId).toBe('dQw4w9WgXcQ');
    });

    it('takes it out of one carrying query parameters', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share';
      expect(cutIn.videoId).toBe('dQw4w9WgXcQ');
    });
  });

  describe('videoStart', () => {
    let cutIn: CutIn;

    beforeEach(() => {
      cutIn = new CutIn();
      cutIn.initialize();
      cutIn.isVideoCutIn = true;
    });

    it('reads the seconds off the start parameter', () => {
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abc123&start=120';
      expect(cutIn.videoStart).toBe('120');
    });

    it('reads them off the time parameter', () => {
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abc123&t=60';
      expect(cutIn.videoStart).toBe('60');
    });

    it('reads them out of hours, minutes and seconds', () => {
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abc123&t=1h2m3s';
      expect(cutIn.videoStart).toBe('3723');
    });

    it('returns nothing when neither is there', () => {
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abc123';
      expect(cutIn.videoStart).toBeFalsy();
    });
  });

  describe('playListId', () => {
    let cutIn: CutIn;

    beforeEach(() => {
      cutIn = new CutIn();
      cutIn.initialize();
      cutIn.isVideoCutIn = true;
    });

    it('takes the playlist identifier out of the address', () => {
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abc123&list=PLtest123';
      expect(cutIn.playListId).toBe('PLtest123');
    });

    it('returns nothing when it is not there', () => {
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abc123';
      expect(cutIn.playListId).toBe('');
    });
  });

  describe('the scene it carries', () => {
    function makeCutIn(): CutIn {
      const cutIn = new CutIn();
      cutIn.initialize();
      return cutIn;
    }

    function giveScene(cutIn: CutIn): CutInScene {
      const scene = new CutInScene();
      scene.initialize();
      scene.cutInIdentifier = cutIn.identifier;
      return scene;
    }

    function addLayer(scene: CutInScene, name: string): CutInLayer {
      const layer = new CutInLayer();
      layer.initialize();
      layer.name = name;
      scene.appendChild(layer);
      return layer;
    }

    it('carries none to begin with', () => {
      const cutIn = makeCutIn();

      expect(cutIn.scene).toBeNull();
      expect(cutIn.isComposed).toBe(false);
    });

    it('is composed only once a layer is laid into it', () => {
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn);

      expect(cutIn.scene).toBe(scene);
      expect(cutIn.isComposed).toBe(false);

      addLayer(scene, '立ち絵');

      expect(cutIn.isComposed).toBe(true);
    });

    it('writes nothing inside itself without one', () => {
      const cutIn = makeCutIn();
      cutIn.name = '素の演出';

      const xml = ObjectSerializer.instance.toXml(cutIn);

      expect(xml).toContain('name="素の演出"');
      expect(xml).toContain('></cut-in>');
    });

    it('writes the scene and its layers inside itself', () => {
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn);
      scene.durationMs = 2500;
      addLayer(scene, '立ち絵').tracks = encodeCutInTracks({ x: [{ t: 0, v: -400 }] });

      const xml = ObjectSerializer.instance.toXml(cutIn);

      expect(xml).toContain('<cut-in-scene');
      expect(xml).toContain('durationMs="2500"');
      expect(xml).toContain('<cut-in-layer');
      expect(xml).toContain('name="立ち絵"');
    });

    it('reads its layers back, in order and still moving', () => {
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn);
      scene.durationMs = 2500;
      scene.sceneLoop = true;
      addLayer(scene, '背景');
      addLayer(scene, '文字').tracks = encodeCutInTracks({ opacity: [{ t: 300, v: 1 }] });
      const xml = ObjectSerializer.instance.toXml(cutIn);
      store.clearDeleteHistory();
      const restored = ObjectSerializer.instance.parseXml(xml) as CutIn;

      expect(restored.isComposed).toBe(true);
      expect(restored.scene?.durationMs).toBe(2500);
      expect(restored.scene?.sceneLoop).toBe(true);
      expect(restored.scene?.layers.map((layer) => layer.name)).toEqual(['背景', '文字']);
      expect(restored.scene?.layers[1].trackSet.opacity).toEqual([{ t: 300, v: 1 }]);
    });

    it('binds the scene it reads to itself rather than to where it came from', () => {
      const cutIn = makeCutIn();
      giveScene(cutIn);
      const xml = ObjectSerializer.instance.toXml(cutIn);

      const copy = ObjectSerializer.instance.parseXml(xml) as CutIn;

      expect(copy.identifier).not.toBe(cutIn.identifier);
      expect(copy.scene?.cutInIdentifier).toBe(copy.identifier);
      expect(cutIn.scene?.cutInIdentifier).toBe(cutIn.identifier);
    });

    it('writes its identifier, so the tables that play it can find it again', () => {
      const cutIn = makeCutIn();

      expect(cutIn.toXml()).toContain(`identifier="${cutIn.identifier}"`);
    });

    it('comes back under the identifier it was saved with when a room is loaded in its place', () => {
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn);
      addLayer(scene, '立ち絵');
      const identifier = cutIn.identifier;
      const xml = cutIn.toXml();
      cutIn.destroy();
      store.forgetDeleted([identifier]);

      const restored = ObjectSerializer.instance.parseXml(xml) as CutIn;

      expect(restored.identifier).toBe(identifier);
      expect(store.get(identifier)).toBe(restored);
      expect(restored.scene?.cutInIdentifier).toBe(identifier);
      expect(restored.scene?.layers).toHaveLength(1);
    });

    it('reads a cut-in written before layers existed', () => {
      const restored = ObjectSerializer.instance.parseXml(
        '<cut-in name="古い演出" width="640" height="360" isLoop="true" outTime="5"></cut-in>'
      ) as CutIn;

      expect(restored.name).toBe('古い演出');
      expect(restored.width).toBe(640);
      expect(restored.isLoop).toBe(true);
      expect(restored.outTime).toBe(5);
      expect(restored.isComposed).toBe(false);
    });

    it('takes the scene with it when it is destroyed', () => {
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn);
      const layer = addLayer(scene, '立ち絵');

      cutIn.destroy();

      expect(store.get(scene.identifier)).toBeNull();
      expect(store.get(layer.identifier)).toBeNull();
    });

    it('takes it with it when the deletion came from elsewhere', () => {
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn);

      store.delete(cutIn);

      expect(store.get(scene.identifier)).toBeNull();
    });
  });
});
