import { FillStyle, MapScene } from '@axe/features/map-editor/model/scene';
import {
  IMAGE_TEXTURE_PREFIX,
  imageTextureIdentifier,
  isImageTextureId,
} from '@axe/features/map-editor/model/textures';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const MAP_JSON_PATH = 'map.json';
const TEXTURES_PREFIX = 'textures/';
const IMAGES_PREFIX = 'images/';

/**
 * Zips a scene's JSON together with the image bytes it uses, each keyed by its image identifier.
 *
 * The JSON is stored as `map.json`, texture images under `textures/` and placed images under
 * `images/`.
 */
export function packSceneArchive(
  json: string,
  textures: Record<string, Uint8Array>,
  images: Record<string, Uint8Array>
): Uint8Array {
  const entries: Record<string, Uint8Array> = { [MAP_JSON_PATH]: strToU8(json) };
  for (const [identifier, bytes] of Object.entries(textures)) {
    entries[TEXTURES_PREFIX + identifier] = bytes;
  }
  for (const [identifier, bytes] of Object.entries(images)) {
    entries[IMAGES_PREFIX + identifier] = bytes;
  }
  return zipSync(entries);
}

/**
 * Reads a map archive back into its JSON and its texture and image bytes, keyed by the identifiers
 * they were packed under.
 *
 * Null when the data is not a zip or holds no `map.json`.
 */
export function unpackSceneArchive(
  data: Uint8Array
): { json: string; textures: Record<string, Uint8Array>; images: Record<string, Uint8Array> } | null {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(data);
  } catch {
    return null;
  }
  const mapEntry = unzipped[MAP_JSON_PATH];
  if (!mapEntry) return null;
  const textures: Record<string, Uint8Array> = {};
  const images: Record<string, Uint8Array> = {};
  for (const [path, bytes] of Object.entries(unzipped)) {
    if (path.startsWith(TEXTURES_PREFIX)) {
      textures[path.slice(TEXTURES_PREFIX.length)] = bytes;
    } else if (path.startsWith(IMAGES_PREFIX)) {
      images[path.slice(IMAGES_PREFIX.length)] = bytes;
    }
  }
  return { json: strFromU8(mapEntry), textures, images };
}

/**
 * Whether the bytes start with a zip signature, which tells a map archive from a plain JSON map
 * file.
 */
export function isZipArchive(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

function remapFill(fill: FillStyle | null | undefined, map: Map<string, string>): void {
  if (!fill || fill.type !== 'texture' || !isImageTextureId(fill.textureId)) return;
  const next = map.get(imageTextureIdentifier(fill.textureId));
  if (next) fill.textureId = IMAGE_TEXTURE_PREFIX + next;
}

/**
 * Rewrites the image identifiers a scene points at, in place, using a map from old identifier to
 * new.
 *
 * It covers image textures in cell fills and in shape fills and stroke fills, and the pictures on
 * image layers. Identifiers missing from the map are left as they are.
 */
export function remapSceneImageIdentifiers(scene: MapScene, map: Map<string, string>): void {
  for (const layer of scene.layers) {
    if (layer.kind === 'cell') {
      for (const fill of Object.values(layer.cells)) remapFill(fill, map);
    } else if (layer.kind === 'shape') {
      for (const item of layer.items) {
        remapFill(item.fill, map);
        remapFill(item.stroke?.fill, map);
      }
    } else if (layer.kind === 'image') {
      for (const item of layer.items) {
        const next = map.get(item.imageIdentifier);
        if (next) item.imageIdentifier = next;
      }
    }
  }
}
