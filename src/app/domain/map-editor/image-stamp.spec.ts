import {
  imageStampIdentifier,
  isImageStampId,
  MAP_STAMP_TAG,
  toImageStampId,
} from '@axe/domain/map-editor/image-stamp';
import { describe, expect, it } from 'vitest';

describe('image-stamp', () => {
  it('round-trips an identifier through the image stamp id', () => {
    const id = toImageStampId('abc123');
    expect(isImageStampId(id)).toBe(true);
    expect(imageStampIdentifier(id)).toBe('abc123');
  });

  it('treats built-in stamp ids as non-image', () => {
    expect(isImageStampId('door-single')).toBe(false);
    expect(imageStampIdentifier('door-single')).toBe('');
  });

  it('exposes the reserved tag', () => {
    expect(MAP_STAMP_TAG).toBe('マップスタンプ');
  });
});
