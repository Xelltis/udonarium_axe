import { TextureId } from '@axe/domain/media/texture-catalog';

export const LEGACY_TEXTURE_ALIASES: Record<string, TextureId> = {
  grass: 'steppe',
  water: 'sea',
  stone: 'rock',
  wood: 'floor',
  dirt: 'black_soil',
  tile: 'stone_tile',
  snow: 'gravel',
};

export const IMAGE_TEXTURE_PREFIX = 'image:';

/** Whether a texture id points at an uploaded image rather than a bundled texture. */
export function isImageTextureId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(IMAGE_TEXTURE_PREFIX);
}

/**
 * The image identifier an uploaded-image texture id points at, or an empty string for a bundled
 * texture.
 */
export function imageTextureIdentifier(id: string): string {
  return isImageTextureId(id) ? id.slice(IMAGE_TEXTURE_PREFIX.length) : '';
}

/**
 * Maps a texture name used by older scenes onto the bundled texture that replaced it; any other id
 * comes back unchanged.
 */
export function normalizeTextureId(id: string): string {
  if (typeof id !== 'string') return id;
  const alias = LEGACY_TEXTURE_ALIASES[id];
  if (alias) return alias;
  return id;
}
