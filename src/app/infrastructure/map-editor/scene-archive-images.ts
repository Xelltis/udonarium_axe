import { ImageStorage } from '@axe/core/storage/image-storage';
import { FillStyle, MapScene } from '@axe/domain/map-editor/scene';
import { deserializeScene, serializeScene } from '@axe/domain/map-editor/serialize';
import { imageTextureIdentifier, isImageTextureId } from '@axe/domain/map-editor/textures';
import { ImageTag } from '@axe/domain/media/image-tag';
import { TEXTURE_IMAGE_TAG } from '@axe/domain/media/texture-catalog';
import {
  packSceneArchive,
  remapSceneImageIdentifiers,
  unpackSceneArchive,
} from '@axe/infrastructure/map-editor/scene-archive';

/**
 * The images a map uses. Patterns and placed pictures live in different places.
 *
 * Only these go into the archive. Bundling images the map never shows would fill the
 * recipient's storage with pictures they have no use for.
 */
export function collectSceneImageIds(scene: MapScene): { textureIds: Set<string>; imageIds: Set<string> } {
  const textureIds = new Set<string>();
  const imageIds = new Set<string>();

  const addFill = (fill: FillStyle | null | undefined): void => {
    if (fill && fill.type === 'texture' && fill.textureId && isImageTextureId(fill.textureId)) {
      textureIds.add(imageTextureIdentifier(fill.textureId));
    }
  };

  for (const layer of scene.layers) {
    if (layer.kind === 'cell') {
      for (const fill of Object.values(layer.cells)) addFill(fill as FillStyle);
    } else if (layer.kind === 'shape') {
      for (const item of layer.items) {
        addFill(item.fill);
        addFill(item.stroke?.fill);
      }
    } else if (layer.kind === 'image') {
      for (const item of layer.items) imageIds.add(item.imageIdentifier);
    }
  }
  return { textureIds, imageIds };
}

async function bytesOf(imageStorage: ImageStorage, ids: Set<string>): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const id of ids) {
    const blob = imageStorage.get(id)?.blob;
    if (!blob) continue;
    out[id] = new Uint8Array(await blob.arrayBuffer());
  }
  return out;
}

/** Packs a map and the images it uses into one archive. */
export async function packSceneWithImages(scene: MapScene, imageStorage: ImageStorage): Promise<Uint8Array> {
  const { textureIds, imageIds } = collectSceneImageIds(scene);
  return packSceneArchive(
    serializeScene(scene),
    await bytesOf(imageStorage, textureIds),
    await bytesOf(imageStorage, imageIds)
  );
}

async function registerImages(
  imageStorage: ImageStorage,
  bytes: Record<string, Uint8Array>,
  asTexture: boolean
): Promise<Map<string, string>> {
  const registered = new Map<string, string>();
  for (const [oldId, data] of Object.entries(bytes)) {
    const blob = new Blob([data.slice()], { type: 'image/webp' });
    const imageFile = await imageStorage.addAsync(blob, { putBack: true });
    if (!imageFile) continue;
    registered.set(oldId, imageFile.identifier);
    if (asTexture && !ImageTag.get(imageFile.identifier)) {
      const tag = ImageTag.create(imageFile.identifier);
      tag.tag = TEXTURE_IMAGE_TAG;
    }
  }
  return registered;
}

/**
 * Takes a map out of an archive and puts its images back into local storage.
 *
 * Each image is given a new identifier as it arrives, so the map's references are remapped.
 * Null for an archive it cannot read.
 */
export async function unpackSceneWithImages(
  buffer: Uint8Array,
  imageStorage: ImageStorage,
  onTexturesAdded?: () => void
): Promise<MapScene | null> {
  const unpacked = unpackSceneArchive(buffer);
  if (!unpacked) return null;

  const scene = deserializeScene(unpacked.json);
  if (!scene) return null;

  const textures = await registerImages(imageStorage, unpacked.textures, true);
  const images = await registerImages(imageStorage, unpacked.images, false);
  if (textures.size > 0) onTexturesAdded?.();

  remapSceneImageIdentifiers(scene, new Map([...textures, ...images]));
  return scene;
}
