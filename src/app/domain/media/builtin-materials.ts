import { ImageContext, ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameObject } from '@axe/core/sync/game-object';
import { ImageTag } from '@axe/domain/media/image-tag';
import { TEXTURE_ASSET_URLS, TEXTURE_IMAGE_TAG, WALL_TEXTURE_ASSET_URLS } from '@axe/domain/media/texture-catalog';

/** Where every picture the tool is built with is kept, floors and walls alike. */
const BUILTIN_MATERIAL_URLS: readonly string[] = [
  ...Object.values(TEXTURE_ASSET_URLS),
  ...Object.values(WALL_TEXTURE_ASSET_URLS),
];

const builtinMaterials = new Set(BUILTIN_MATERIAL_URLS);

/**
 * Whether a picture is one the tool is built with rather than one somebody brought.
 *
 * A picture is kept under the path it is served from, so the path is what says so.
 */
export function isBuiltinMaterial(imageIdentifier: string): boolean {
  return builtinMaterials.has(imageIdentifier);
}

/**
 * Puts the floor and wall pictures the tool is built with in the media library.
 *
 * They were there to be picked from the dungeon builder and the map editor and nowhere else,
 * so a terrain block built by hand had nothing to dress itself in but a picture somebody
 * brought. Filed here they are offered wherever a picture is, under the same tag a pattern
 * somebody adds themselves is filed under, so the two sit on one shelf.
 *
 * Called on a fresh store, before a room's own objects arrive, so every seat files the same
 * pictures under the same names and syncing settles them into one set. A picture already in
 * the library is left as it is, tag and all: a shelf somebody has rearranged is theirs.
 */
export function registerBuiltinMaterials(imageStorage: ImageStorage): void {
  GameObject.batch(() => {
    for (const [id, url] of Object.entries(TEXTURE_ASSET_URLS)) fileMaterial(imageStorage, id, url);
    for (const [id, url] of Object.entries(WALL_TEXTURE_ASSET_URLS)) fileMaterial(imageStorage, id, url);
  });
}

/**
 * Files one picture, unless the room already knows it or has thrown it away.
 *
 * It goes in under the name the material is known by rather than the path it is kept at: a
 * list of pictures all called `assets/images/tiles/…` tells a reader nothing, and the name a
 * picture is stored under is shared with the room, so it is not one to translate.
 */
function fileMaterial(imageStorage: ImageStorage, id: string, url: string): void {
  const image = imageStorage.get(url) ?? imageStorage.add(namedPicture(id, url));
  if (ImageTag.get(image.identifier)) return;
  const filed = ImageTag.create(image.identifier);
  // A picture somebody deleted stays deleted: the name is kept back, and the tag made under
  // it never reaches the store.
  if (ImageTag.get(image.identifier) !== filed) return;
  filed.tag = TEXTURE_IMAGE_TAG;
}

/** A picture kept at a path, under the name the material is known by. */
function namedPicture(id: string, url: string): ImageContext {
  const context = ImageFile.createEmpty(url).toContext();
  context.name = id;
  context.url = url;
  return context;
}
