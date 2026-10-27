import {
  IMAGE_TEXTURE_PREFIX,
  imageTextureIdentifier,
  isImageTextureId,
  LEGACY_TEXTURE_ALIASES,
  normalizeTextureId,
} from '@axe/domain/map-editor/textures';
import { TEXTURE_IDS } from '@axe/domain/media/texture-catalog';
import { describe, expect, it } from 'vitest';

describe('normalizeTextureId', () => {
  it('maps legacy aliases to the new ids', () => {
    expect(LEGACY_TEXTURE_ALIASES).toEqual({
      grass: 'steppe',
      water: 'sea',
      stone: 'rock',
      wood: 'floor',
      dirt: 'black_soil',
      tile: 'stone_tile',
      snow: 'gravel',
    });
    for (const [legacy, target] of Object.entries(LEGACY_TEXTURE_ALIASES)) {
      expect(normalizeTextureId(legacy)).toBe(target);
    }
  });

  it('passes valid new ids through unchanged', () => {
    for (const id of TEXTURE_IDS) expect(normalizeTextureId(id)).toBe(id);
    expect(normalizeTextureId('sand')).toBe('sand');
    expect(normalizeTextureId('brick')).toBe('brick');
    expect(normalizeTextureId('lava')).toBe('lava');
  });

  it('passes image: ids through unchanged', () => {
    expect(normalizeTextureId('image:abc')).toBe('image:abc');
  });

  it('returns unknown ids unchanged', () => {
    expect(normalizeTextureId('mystery')).toBe('mystery');
  });
});

describe('image texture ids', () => {
  it('exposes the prefix', () => {
    expect(IMAGE_TEXTURE_PREFIX).toBe('image:');
  });

  it('detects image texture ids', () => {
    expect(isImageTextureId('image:foo')).toBe(true);
    expect(isImageTextureId('image:')).toBe(true);
    expect(isImageTextureId('steppe')).toBe(false);
    expect(isImageTextureId('')).toBe(false);
    expect(isImageTextureId(undefined as unknown as string)).toBe(false);
  });

  it('extracts the identifier after the prefix', () => {
    expect(imageTextureIdentifier('image:abc123')).toBe('abc123');
    expect(imageTextureIdentifier('image:')).toBe('');
    expect(imageTextureIdentifier('steppe')).toBe('');
  });

  it('round-trips prefix and identifier', () => {
    const identifier = 'some-storage-id';
    const id = IMAGE_TEXTURE_PREFIX + identifier;
    expect(isImageTextureId(id)).toBe(true);
    expect(imageTextureIdentifier(id)).toBe(identifier);
  });
});
