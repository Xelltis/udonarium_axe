import { TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  createDefaultCutIns,
  DEFAULT_CUT_IN_SEEDS,
  missingDefaultCutInIdentifiers,
  restoreDefaultCutIns,
  SAMPLE_FACE_IDENTIFIER,
  SAMPLE_PORTRAIT_IDENTIFIER,
} from '@axe/domain/media/builtin-cut-ins';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { sceneDurationOf, toWebAnimationFrames } from '@axe/domain/media/cut-in-scene-timeline';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { PresetSound } from '@axe/domain/media/sound-effect';

describe('the cut-ins a new room starts with', () => {
  let store: ObjectStore;
  let imageStorage: ImageStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    // The sounds are looked up by name at the moment they are needed, and nothing has
    // registered them here the way starting the app would.
    PresetSound.flashImpact = 'flash-sound';
    PresetSound.collapse = 'collapse-sound';
    store = ObjectStore.instance;
    imageStorage = ImageStorage.instance;
  });

  afterEach(() => {
    imageStorage.images.forEach((image) => imageStorage.delete(image.identifier));
  });

  const made = () => createDefaultCutIns(imageStorage);

  it('names each one once', () => {
    const identifiers = DEFAULT_CUT_IN_SEEDS.map((seed) => seed.identifier);

    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('sizes every sample inside the bounds a cut-in is held to, so it plays at the size it was laid out at', () => {
    for (const cutIn of made()) {
      expect(cutIn.shownSize, cutIn.name).toEqual({ width: cutIn.width, height: cutIn.height });
    }
  });

  it('makes one of each', () => {
    expect(made()).toHaveLength(DEFAULT_CUT_IN_SEEDS.length);
    expect(store.getObjects(CutIn)).toHaveLength(DEFAULT_CUT_IN_SEEDS.length);
  });

  it('claims no name for a sample whose scene is already taken', () => {
    const seed = DEFAULT_CUT_IN_SEEDS[0];
    const squatter = new CutInScene(seed.sceneIdentifier);
    squatter.initialize();

    const cutIns = made();

    expect(cutIns.map((cutIn) => cutIn.identifier)).not.toContain(seed.identifier);
    expect(store.get<CutIn>(seed.identifier)?.name).not.toBe(seed.name);
  });

  it('makes no second copy for someone joining a room that has them', () => {
    made();
    made();

    expect(store.getObjects(CutIn)).toHaveLength(DEFAULT_CUT_IN_SEEDS.length);
  });

  it('registers the faces it comes with, one identifier each', () => {
    made();
    made();

    for (const identifier of [SAMPLE_PORTRAIT_IDENTIFIER, SAMPLE_FACE_IDENTIFIER]) {
      expect(imageStorage.get(identifier)).not.toBeNull();
      expect(imageStorage.images.filter((image) => image.identifier === identifier)).toHaveLength(1);
    }
  });

  it('keeps the faces it comes with out of the media library', () => {
    made();

    for (const identifier of [SAMPLE_PORTRAIT_IDENTIFIER, SAMPLE_FACE_IDENTIFIER]) {
      expect(ImageTag.get(identifier)?.tag).toBe(SYSTEM_RESERVED_TAG);
    }
  });

  it('shows a face through each of them, cropped to the eyes', () => {
    const [flash, tear] = made();
    const faceOf = (cutIn: CutIn) => cutIn.scene!.layers.filter((layer) => layer.kind === 'image');

    for (const cutIn of [flash, tear]) {
      expect(faceOf(cutIn)).toHaveLength(1);
      expect(faceOf(cutIn)[0].objectFit).toBe('cover');
      // Never so far down the picture that a portrait would show its chest.
      expect(faceOf(cutIn)[0].objectPosY).toBeLessThanOrEqual(50);
      expect(faceOf(cutIn)[0].name).toContain('差し替える');
    }

    expect(faceOf(flash)[0].imageIdentifier).toBe(SAMPLE_PORTRAIT_IDENTIFIER);
    expect(faceOf(tear)[0].imageIdentifier).toBe(SAMPLE_FACE_IDENTIFIER);
  });

  it('stamps the word for the sound it makes', () => {
    const [flash, tear] = made();
    const wordsOf = (cutIn: CutIn) =>
      cutIn.scene!.layers.filter((layer) => layer.kind === 'text').map((layer) => layer.text);

    expect(wordsOf(flash).join('')).toBe('カッ');
    expect(wordsOf(tear).join('')).toBe('ブチッ');
  });

  it('sets the older word downwards, with the small letter small', () => {
    const [flash] = made();
    const words = flash.scene!.layers.filter((layer) => layer.kind === 'text');

    expect(words.map((layer) => layer.text)).toEqual(['カ', 'ッ']);
    for (const word of words) expect(word.vertical).toBe(true);
    // The small letter is smaller, and sits below the one it follows.
    expect(words[1].fontSizePx).toBeLessThan(words[0].fontSizePx);
    expect(words[1].y).toBeGreaterThan(words[0].y);
  });

  it('lays the older one out as a plain band across the screen', () => {
    const [flash] = made();
    const band = flash.scene!.layers.find((layer) => layer.name === '帯の縁')!;

    // Wide and short, and a rectangle: nothing cut off it and nothing leaning.
    expect(flash.width / flash.height).toBeGreaterThan(3);
    expect(band.width / band.height).toBeGreaterThan(3);
    expect(band.clip).toBe('none');
    expect(band.rotation).toBe(0);
    expect(band.skewXDeg).toBe(0);
  });

  it('rips the newer one open as a gash rather than opening a window', () => {
    const [, tear] = made();
    const edge = tear.scene!.layers.find((layer) => layer.name === '裂け目の縁')!;

    expect(edge.clip).toBe('gash');
    // Long and shallow, which is the shape of something torn rather than cut out.
    expect(edge.width / edge.height).toBeGreaterThan(2.5);
    // It runs along from the left rather than arriving from somewhere or opening at once.
    expect(edge.wipeShape).toBe('chevronRight');
    expect(edge.trackSet.wipe?.[0].v).toBe(0);
    expect(edge.trackSet.wipe?.[1].v).toBe(1);
    expect(edge.trackSet.x).toBeUndefined();
  });

  it('strikes both of them on the same note, and hears the tear settle after', () => {
    const [flash, tear] = made();

    expect(flash.scene!.soundList.map((sound) => sound.a)).toEqual([PresetSound.flashImpact]);
    // The tear is heard twice: once as it opens, once as what is left comes away.
    expect(tear.scene!.soundList.map((sound) => sound.a)).toEqual([PresetSound.flashImpact, PresetSound.collapse]);
    const settleAt = tear.scene!.soundList[1].t;
    const crumbleTrack = tear.scene!.layers[0].trackSet.crumble!;
    expect(settleAt).toBe(crumbleTrack[0].t);
  });

  it('crumbles the tear away from the left rather than fading it out', () => {
    const [, tear] = made();
    const going = tear.scene!.layers.filter((layer) => layer.crumbleShape !== 'none');

    // Everything the tear is made of goes, and all of it the same way.
    expect(going).toHaveLength(tear.scene!.layers.length);
    for (const layer of going) {
      expect(layer.crumbleShape).toBe('crumbleLeft');
      const crumble = layer.trackSet.crumble!;
      expect(crumble[0].v).toBe(1);
      expect(crumble[crumble.length - 1].v).toBe(0);
      // It has come away before anything is left for the fade to see off.
      const opacity = layer.trackSet.opacity!;
      expect(crumble[crumble.length - 1].t).toBeLessThanOrEqual(opacity[opacity.length - 1].t);
    }
  });

  it('unzips every torn layer together', () => {
    const [, tear] = made();
    const torn = tear.scene!.layers.filter((layer) => layer.clip === 'gash');

    expect(torn.length).toBeGreaterThanOrEqual(2);
    for (const layer of torn) {
      expect(layer.wipeShape).toBe('chevronRight');
      expect(layer.trackSet.wipe).toEqual(torn[0].trackSet.wipe);
    }
  });

  it('lets the red backing show past the torn white edge', () => {
    const [, tear] = made();
    const layers = tear.scene!.layers;
    const backing = layers.find((layer) => layer.name === '裂け目の裏地')!;
    const edge = layers.find((layer) => layer.name === '裂け目の縁')!;
    const face = layers.find((layer) => layer.kind === 'image')!;

    // Each is torn to the same outline and sits a little inside the one behind it.
    for (const layer of [backing, edge, face]) expect(layer.clip).toBe('gash');
    expect(backing.width).toBeGreaterThan(edge.width);
    expect(edge.width).toBeGreaterThan(face.width);
    expect(layers.indexOf(backing)).toBeLessThan(layers.indexOf(edge));
  });

  it('sets the newer word down the right rather than along the band', () => {
    const [, tear] = made();
    const word = tear.scene!.layers.find((layer) => layer.kind === 'text')!;

    expect(word.vertical).toBe(true);
    expect(word.letterSpacingPx).toBeLessThan(0);
    expect(word.height).toBeGreaterThan(word.width);
    expect(word.x).toBeGreaterThan(tear.width / 2);
    // It leans the other way from the tear, and stands taller than the tear it is on.
    expect(word.rotation).toBeGreaterThan(0);
    const edge = tear.scene!.layers.find((layer) => layer.name === '裂け目の縁')!;
    expect(word.height).toBeGreaterThan(edge.height);
  });

  it('lays lines converging on the middle behind the band', () => {
    const [flash] = made();
    const rays = flash.scene!.layers.find((layer) => layer.fillShape === 'speedlines');

    expect(rays).toBeDefined();
    expect(rays!.width).toBeGreaterThan(flash.width * 0.9);
  });

  it('plays without a frame around it, and answers to its name in the chat', () => {
    for (const cutIn of made()) {
      expect(cutIn.frameless).toBe(true);
      expect(cutIn.chatActivate).toBe(true);
      expect(cutIn.name.length).toBeGreaterThan(0);
    }
  });

  it('finishes inside the length it was given', () => {
    for (const cutIn of made()) {
      const scene = cutIn.scene!;
      expect(sceneDurationOf(scene)).toBe(scene.durationMs);
    }
  });

  it('leaves nothing behind when the scene ends', () => {
    for (const cutIn of made()) {
      const scene = cutIn.scene!;
      for (const layer of scene.layers) {
        const frames = toWebAnimationFrames(layer, sceneDurationOf(scene));

        expect(frames.length).toBeGreaterThan(1);
        expect(frames[frames.length - 1].opacity).toBe(0);
      }
    }
  });

  it('wipes the band open rather than fading it in', () => {
    const [flash] = made();
    const band = flash.scene!.layers.find((layer) => layer.name === '帯の縁')!;

    expect(band.trackSet.scaleX?.[0].v).toBeLessThan(0.1);
    expect(band.trackSet.opacity?.[0].v).toBe(1);
  });

  it('stamps the word at the end of the band, leaning', () => {
    const [flash] = made();
    const word = flash.scene!.layers.find((layer) => layer.kind === 'text')!;

    expect(word.x).toBeGreaterThan(flash.width / 2);
    expect(word.rotation).toBeLessThan(0);
  });

  it('survives being written out and read back', () => {
    const [flash] = made();
    const xml = ObjectSerializer.instance.toXml(flash);
    const names = flash.scene!.layers.map((layer) => layer.name);
    store.clearDeleteHistory();
    const restored = ObjectSerializer.instance.parseXml(xml) as CutIn;

    expect(restored.scene?.layers.map((layer) => layer.name)).toEqual(names);
    expect(restored.scene?.layers.find((layer) => layer.kind === 'image')?.imageIdentifier).toBe(
      SAMPLE_PORTRAIT_IDENTIFIER
    );
  });

  describe('putting back what the samples have lost', () => {
    const [seed] = DEFAULT_CUT_IN_SEEDS;
    const layersOf = (identifier: string) =>
      store.get<CutIn>(identifier)!.scene!.layers.map((layer) => layer.identifier);

    it('makes a sample deleted whole again, under the names it had', () => {
      made();
      store.get<CutIn>(seed.identifier)!.destroy();
      expect(missingDefaultCutInIdentifiers()).toEqual([
        seed.identifier,
        seed.sceneIdentifier,
        ...seed.layers.map((layer) => layer.identifier),
      ]);

      expect(restoreDefaultCutIns(imageStorage)).toBe(1);

      expect(store.get<CutIn>(seed.identifier)!.name).toBe(seed.name);
      expect(layersOf(seed.identifier)).toEqual(seed.layers.map((layer) => layer.identifier));
      expect(missingDefaultCutInIdentifiers()).toEqual([]);
    });

    it('lays a layer taken out of a sample back at its place, keeping what the room made of the sample', () => {
      made();
      const cutIn = store.get<CutIn>(seed.identifier)!;
      cutIn.name = '改名';
      const own = new CutInLayer();
      own.initialize();
      cutIn.scene!.appendChild(own);
      const lost = seed.layers[1].identifier;
      store.get(lost)!.destroy();
      expect(missingDefaultCutInIdentifiers()).toEqual([lost]);

      expect(restoreDefaultCutIns(imageStorage)).toBe(1);

      expect(cutIn.name).toBe('改名');
      expect(layersOf(seed.identifier)).toEqual([...seed.layers.map((layer) => layer.identifier), own.identifier]);
    });

    it('makes nothing where nothing is lost, and leaves the room’s own cut-ins alone', () => {
      made();
      const mine = new CutIn();
      mine.name = '自作';
      mine.initialize();
      const before = store.getObjects(CutIn).length;

      expect(missingDefaultCutInIdentifiers()).toEqual([]);
      expect(restoreDefaultCutIns(imageStorage)).toBe(0);

      expect(store.getObjects(CutIn)).toHaveLength(before);
      expect(mine.name).toBe('自作');
    });

    it('leaves a sample the room has given a scene of its own as the room has it', () => {
      made();
      store.get<CutIn>(seed.identifier)!.scene!.destroy();
      const own = new CutInScene();
      own.cutInIdentifier = seed.identifier;
      own.initialize();

      expect(missingDefaultCutInIdentifiers()).toEqual([]);
      expect(restoreDefaultCutIns(imageStorage)).toBe(0);
      expect(store.get<CutIn>(seed.identifier)!.scene).toBe(own);
    });
  });
});
