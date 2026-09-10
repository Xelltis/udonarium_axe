import { decodeBytes, encodeBytes } from '@axe/core/util/base64-bytes';
import { describe, expect, it } from 'vitest';

describe('base64 bytes', () => {
  it('brings back every byte it was given', () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 255, 42]);

    expect(decodeBytes(encodeBytes(bytes))).toEqual(bytes);
  });

  it('brings back a length that is not a multiple of three', () => {
    for (const length of [1, 2, 4, 5, 7]) {
      const bytes = Uint8Array.from({ length }, (_, i) => i * 37);
      expect(decodeBytes(encodeBytes(bytes))).toEqual(bytes);
    }
  });

  it('writes nothing down for nothing', () => {
    expect(encodeBytes(new Uint8Array(0))).toBe('');
    expect(decodeBytes('')).toEqual(new Uint8Array(0));
  });

  it('passes over anything outside the alphabet rather than reading it as a zero', () => {
    const bytes = Uint8Array.from([9, 8, 7]);
    const text = encodeBytes(bytes);

    expect(decodeBytes(`${text}\n `)).toEqual(bytes);
  });

  it('stops at the count it was asked for', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);

    expect(decodeBytes(encodeBytes(bytes), 2)).toEqual(Uint8Array.from([1, 2]));
  });
});
