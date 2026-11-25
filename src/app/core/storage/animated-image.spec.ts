import { blobMoves, isAnimatedImageBytes } from '@axe/core/storage/animated-image';

function bytesOf(...parts: (readonly number[] | string)[]): ArrayBuffer {
  const bytes: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') for (const char of part) bytes.push(char.charCodeAt(0));
    else bytes.push(...part);
  }
  return new Uint8Array(bytes).buffer;
}

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function chunk(name: string, length = 0): number[] {
  return [(length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff, ...nameBytes(name)];
}

function nameBytes(name: string): number[] {
  return [...name].map((char) => char.charCodeAt(0));
}

function riffChunk(name: string, size = 0): number[] {
  return [...nameBytes(name), size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff];
}

describe('isAnimatedImageBytes()', () => {
  it('finds the animation control chunk of an apng', () => {
    expect(
      isAnimatedImageBytes(bytesOf(PNG_HEAD, chunk('IHDR', 13), new Array(13 + 4).fill(0), chunk('acTL', 8)))
    ).toBe(true);
  });

  it('calls a still png still', () => {
    expect(
      isAnimatedImageBytes(bytesOf(PNG_HEAD, chunk('IHDR', 13), new Array(13 + 4).fill(0), chunk('IDAT', 4)))
    ).toBe(false);
  });

  it('tells a gif of more than one image from one of a single image, and takes a head that ends too soon as moving', () => {
    const screen = ['GIF89a', [4, 0, 4, 0, 0, 0, 0]] as const;
    const image = [0x2c, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 1, 0, 0];
    expect(isAnimatedImageBytes(bytesOf(...screen, image, image, [0x3b]))).toBe(true);
    expect(isAnimatedImageBytes(bytesOf(...screen, image, [0x3b]))).toBe(false);
    expect(isAnimatedImageBytes(bytesOf(...screen, image.slice(0, 12)))).toBe(true);
  });

  it('finds the animation chunk of a webp', () => {
    expect(
      isAnimatedImageBytes(
        bytesOf('RIFF', [0, 0, 0, 0], 'WEBP', riffChunk('VP8X', 10), new Array(10).fill(0), riffChunk('ANIM', 6))
      )
    ).toBe(true);
  });

  it('calls a still webp still', () => {
    expect(
      isAnimatedImageBytes(bytesOf('RIFF', [0, 0, 0, 0], 'WEBP', riffChunk('VP8 ', 8), new Array(8).fill(0)))
    ).toBe(false);
  });

  it('says nothing of what it cannot read', () => {
    expect(isAnimatedImageBytes(new ArrayBuffer(0))).toBe(false);
    expect(isAnimatedImageBytes(bytesOf('not an image at all'))).toBe(false);
  });
});

describe('blobMoves()', () => {
  it('reads whether a picture moves once for each blob, an SVG moving as it may', async () => {
    const screen = ['GIF89a', [4, 0, 4, 0, 0, 0, 0]] as const;
    const image = [0x2c, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 1, 0, 0];
    const still = new Blob([bytesOf(...screen, image, [0x3b])], { type: 'image/gif' });
    const moving = new Blob([bytesOf(...screen, image, image, [0x3b])], { type: 'image/gif' });
    const drawing = new Blob(['<svg/>'], { type: 'image/svg+xml' });

    expect([await blobMoves(still), await blobMoves(moving), await blobMoves(drawing)]).toEqual([false, true, true]);
    expect(blobMoves(still)).toBe(blobMoves(still));
  });
});
