import { asRecipe } from '@axe/domain/ui/skin';
import { asLayer, MAX_LAYERS, SkinLayer } from '@axe/domain/ui/skin-layer';
import { SkinMode, SkinRecipe } from '@axe/domain/ui/skin-palette';

/** What the file says it is, so a zip of something else is turned away rather than half-read. */
export const SKIN_FILE_MARKER = 'udonarium-axe-skin';

/** The version of the shape below. A file from a later one is read as far as it can be. */
export const SKIN_FILE_VERSION = 1;

/** The entry a skin zip is read from and written to. */
export const SKIN_FILE_NAME = 'skin.json';

/** A layer as a file carries it: the arrangement, plus which entry holds the picture. */
export interface SkinFileLayer extends Omit<SkinLayer, 'id'> {
  /** The name of the zip entry the bytes are under. */
  file: string;
}

export interface SkinFile {
  kind: typeof SKIN_FILE_MARKER;
  version: number;
  name: string;
  mode: SkinMode;
  recipe: SkinRecipe;
  layers: SkinFileLayer[];
}

/** A file name that survives a trip through a file system, whatever the skin was called. */
export function skinFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, 40);
  return `${cleaned.length > 0 ? cleaned : 'skin'}.axe-skin.zip`;
}

export function writeSkinFile(
  recipe: SkinRecipe,
  mode: SkinMode,
  name: string,
  packed: readonly { layer: SkinLayer; entry: string }[]
): string {
  const file: SkinFile = {
    kind: SKIN_FILE_MARKER,
    version: SKIN_FILE_VERSION,
    name,
    mode,
    recipe,
    layers: packed.map(({ layer, entry }) => ({
      file: entry,
      name: layer.name,
      opacity: layer.opacity,
      fit: layer.fit,
      anchor: layer.anchor,
    })),
  };
  return JSON.stringify(file, null, 2);
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
  };
}

function readLayers(value: unknown): SkinFileLayer[] {
  if (!Array.isArray(value)) return [];
  const read: SkinFileLayer[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const file = (entry as Record<string, unknown>)['file'];
    if (typeof file !== 'string' || file.length < 1) continue;
    const layer = asLayer({ ...(entry as Record<string, unknown>), id: file });
    if (!layer) continue;
    read.push({ file, name: layer.name, opacity: layer.opacity, fit: layer.fit, anchor: layer.anchor });
    if (read.length >= MAX_LAYERS) break;
  }
  return read;
}
