import { asRecipe } from '@axe/domain/ui/skin';
import { asLayer, MAX_LAYERS, SkinLayer } from '@axe/domain/ui/skin-layer';
import { asDiceMat } from '@axe/domain/ui/skin-mat';
import { SkinMode, SkinRecipe } from '@axe/domain/ui/skin-palette';

/** What the file says it is, so a zip of something else is turned away rather than half-read. */
export const SKIN_FILE_MARKER = 'udonarium-axe-skin';

/**
 * The version of the shape below. A file from a later one is read as far as it can be. Version 2
 * added the mat the dice land on; a file from version 1 has none and leaves the plain one.
 */
export const SKIN_FILE_VERSION = 2;

/** The entry a skin zip is read from and written to. */
export const SKIN_FILE_NAME = 'skin.json';

/** A layer as a file carries it: the arrangement, plus which entry holds the picture. */
export interface SkinFileLayer extends Omit<SkinLayer, 'id'> {
  /** The name of the zip entry the bytes are under. */
  file: string;
}

/** The mat the dice land on as a file carries it: its colour, and its picture's arrangement if it has one. */
export interface SkinFileMat {
  color: string;
  layer: SkinFileLayer | null;
}

export interface SkinFile {
  kind: typeof SKIN_FILE_MARKER;
  version: number;
  name: string;
  mode: SkinMode;
  recipe: SkinRecipe;
  layers: SkinFileLayer[];
  /** Nothing in a file from before mats were offered. */
  mat: SkinFileMat | null;
}

/** A file name that survives a trip through a file system, whatever the skin was called. */
export function skinFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, 40);
  return `${cleaned.length > 0 ? cleaned : 'skin'}.axe-skin.zip`;
}

/**
 * The text of the `skin.json` entry in a skin zip.
 *
 * It holds the marker, version, name, mode and recipe, each layer's arrangement with the name
 * of the zip entry its picture is packed under, and the mat the dice land on with its picture
 * likewise. The layer ids stay behind in this browser.
 */
export function writeSkinFile(
  recipe: SkinRecipe,
  mode: SkinMode,
  name: string,
  packed: readonly { layer: SkinLayer; entry: string }[],
  mat: { color: string; packed: { layer: SkinLayer; entry: string } | null } | null = null
): string {
  const file: SkinFile = {
    kind: SKIN_FILE_MARKER,
    version: SKIN_FILE_VERSION,
    name,
    mode,
    recipe,
    layers: packed.map(fileLayerOf),
    mat: mat && { color: mat.color, layer: mat.packed && fileLayerOf(mat.packed) },
  };
  return JSON.stringify(file, null, 2);
}

function fileLayerOf({ layer, entry }: { layer: SkinLayer; entry: string }): SkinFileLayer {
  return { file: entry, name: layer.name, opacity: layer.opacity, fit: layer.fit, anchor: layer.anchor };
}

/**
 * A skin read back out of a file someone was handed.
 *
 * Nothing in here is trusted: the numbers go through the same clamps the sliders do, so a
 * file that asks for a chroma of nine hundred lands on the same skin a slider would, and a
 * layer naming no picture is dropped rather than left pointing at nothing.
 */
export function readSkinFile(text: string): SkinFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const raw = parsed as Record<string, unknown>;
  if (raw['kind'] !== SKIN_FILE_MARKER) return null;

  const mode: SkinMode = raw['mode'] === 'dark' ? 'dark' : 'light';

  return {
    kind: SKIN_FILE_MARKER,
    version: typeof raw['version'] === 'number' ? raw['version'] : SKIN_FILE_VERSION,
    name: typeof raw['name'] === 'string' ? raw['name'].slice(0, 40) : '',
    mode,
    recipe: asRecipe(raw['recipe'], mode),
    layers: readLayers(raw['layers']),
    mat: readMat(raw['mat']),
  };
}

function readMat(value: unknown): SkinFileMat | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return { color: asDiceMat({ color: raw['color'] }).color, layer: readLayer(raw['layer']) };
}

function readLayer(entry: unknown): SkinFileLayer | null {
  if (!entry || typeof entry !== 'object') return null;
  const file = (entry as Record<string, unknown>)['file'];
  if (typeof file !== 'string' || file.length < 1) return null;
  const layer = asLayer({ ...(entry as Record<string, unknown>), id: file });
  return layer && { file, name: layer.name, opacity: layer.opacity, fit: layer.fit, anchor: layer.anchor };
}

function readLayers(value: unknown): SkinFileLayer[] {
  if (!Array.isArray(value)) return [];
  const read: SkinFileLayer[] = [];
  for (const entry of value) {
    const layer = readLayer(entry);
    if (!layer) continue;
    read.push(layer);
    if (read.length >= MAX_LAYERS) break;
  }
  return read;
}
