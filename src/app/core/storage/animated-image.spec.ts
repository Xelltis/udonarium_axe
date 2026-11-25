import { animationOfHead, blobMoves, knownBlobMoves, readWhetherMoves } from '@axe/core/storage/animated-image';

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

describe('animationOfHead()', () => {
  it('finds the animation control chunk of an apng', () => {
    expect(animationOfHead(bytesOf(PNG_HEAD, chunk('IHDR', 13), new Array(13 + 4).fill(0), chunk('acTL', 8)))).toBe(
      true
    );
  });

  it('calls a still png still', () => {
    expect(animationOfHead(bytesOf(PNG_HEAD, chunk('IHDR', 13), new Array(13 + 4).fill(0), chunk('IDAT', 4)))).toBe(
      false
    );
  });

  it('walks a gif past its colour tables and its extensions, the loop and the frame control among them', () => {
    const screen = ['GIF89a', [4, 0, 4, 0, 0x81, 0, 0], new Array(12).fill(0)] as const;
    const loop = [0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0];
    const control = [0x21, 0xf9, 4, 0, 10, 0, 0, 0];
    const comment = [0x21, 0xfe, 3, 0x61, 0x62, 0x63, 0];
    const image = [0x2c, 0, 0, 0, 0, 4, 0, 4, 0, 0x80, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0];
    const frames = (count: number) => Array.from({ length: count }, () => [...control, ...image]).flat();
    expect(animationOfHead(bytesOf(...screen, loop, comment, frames(2), [0x3b]))).toBe(true);
    expect(animationOfHead(bytesOf(...screen, loop, comment, frames(1), [0x3b]))).toBe(false);
  });

  it('tells a gif of more than one image from one of a single image, and says nothing yet of a head that ends too soon', () => {
    const screen = ['GIF89a', [4, 0, 4, 0, 0, 0, 0]] as const;
    const image = [0x2c, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 1, 0, 0];
    expect(animationOfHead(bytesOf(...screen, image, image, [0x3b]))).toBe(true);
    expect(animationOfHead(bytesOf(...screen, image, [0x3b]))).toBe(false);
    expect(animationOfHead(bytesOf(...screen, image.slice(0, 12)))).toBeNull();
  });

  it('finds the animation chunk of a webp', () => {
    expect(
      animationOfHead(
        bytesOf('RIFF', [0, 0, 0, 0], 'WEBP', riffChunk('VP8X', 10), [0x02], new Array(9).fill(0), riffChunk('ANIM', 6))
      )
    ).toBe(true);
  });

  it('reads a webp as animated by the flag of its first chunk, though a large colour profile pushes its ANIM chunk past the head', () => {
    const flagged = (flags: number) =>
      animationOfHead(
        bytesOf(
          'RIFF',
          [0, 0, 0, 0],
          'WEBP',
          riffChunk('VP8X', 10),
          [flags],
          new Array(9).fill(0),
          riffChunk('ICCP', 70_000)
        )
      );
    expect([flagged(0x02), flagged(0x00)]).toEqual([true, false]);
  });

  it('reads an avif of the image-sequence brand as moving, and one of the still brand as still', () => {
    const avif = (major: string, compatible: string) =>
      animationOfHead(bytesOf([0, 0, 0, 24], 'ftyp', major, [0, 0, 0, 0], compatible, 'mif1'));
    expect([avif('avis', 'avif'), avif('avif', 'avis'), avif('avif', 'mif1')]).toEqual([true, true, false]);
  });

  it('says nothing yet of a png whose head ends before its first pixels, and reads on through a blob to tell', async () => {
    const head = bytesOf(PNG_HEAD, chunk('IHDR', 13), new Array(13 + 4).fill(0), chunk('iTXt', 70_000));
    expect(animationOfHead(head)).toBeNull();
    const still = new Blob(
      [
        bytesOf(
          PNG_HEAD,
          chunk('IHDR', 13),
          new Array(13 + 4).fill(0),
          chunk('iTXt', 70_000),
          new Array(70_004).fill(0),
          chunk('IDAT', 1),
          [0, 0, 0, 0, 0]
        ),
      ],
      { type: 'image/png' }
    );
    expect(await blobMoves(still)).toBe(false);
    const moving = new Blob(
      [
        bytesOf(
          PNG_HEAD,
          chunk('IHDR', 13),
          new Array(13 + 4).fill(0),
          chunk('iTXt', 70_000),
          new Array(70_004).fill(0),
          chunk('acTL', 8),
          new Array(8 + 4).fill(0)
        ),
      ],
      { type: 'image/png' }
    );
    expect(await blobMoves(moving)).toBe(true);
  });

  it('answers a blob it could not read as still for now, and reads it again when next asked', async () => {
    const bytes = bytesOf(
      PNG_HEAD,
      chunk('IHDR', 13),
      new Array(13 + 4).fill(0),
      chunk('acTL', 8),
      new Array(12).fill(0)
    );
    let fail = true;
    const flaky = {
      type: 'image/png',
      size: bytes.byteLength,
      slice: () => ({
        arrayBuffer: async () => {
          if (fail) throw new Error('not readable yet');
          return bytes;
        },
      }),
    } as unknown as Blob;

    expect(await blobMoves(flaky)).toBe(false);
    fail = false;
    expect(await blobMoves(flaky)).toBe(true);
  });

  it('calls a still webp still', () => {
    expect(animationOfHead(bytesOf('RIFF', [0, 0, 0, 0], 'WEBP', riffChunk('VP8 ', 8), new Array(8).fill(0)))).toBe(
      false
    );
  });

  it('calls a lossless webp still', () => {
    expect(animationOfHead(bytesOf('RIFF', [0, 0, 0, 0], 'WEBP', riffChunk('VP8L', 8), new Array(8).fill(0)))).toBe(
      false
    );
  });

  it('says nothing of what it cannot read', () => {
    expect(animationOfHead(new ArrayBuffer(0))).toBe(false);
    expect(animationOfHead(bytesOf('not an image at all'))).toBe(false);
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

describe('readWhetherMoves()', () => {
  it('reads a larger part each time the file has not said, and calls one that ends before saying still', async () => {
    const silent = bytesOf(
      PNG_HEAD,
      chunk('IHDR', 13),
      new Array(13 + 4).fill(0),
      chunk('iTXt', 300_000),
      new Array(300_004).fill(0)
    );
    const asked: number[] = [];

    const moves = await readWhetherMoves(async (length) => {
      asked.push(length);
      return silent.slice(0, length);
    }, silent.byteLength);

    expect(moves).toBe(false);
    expect(asked).toEqual([65_536, 262_144, silent.byteLength]);
  });
});

describe('knownBlobMoves()', () => {
  afterEach(() => vi.useRealTimers());

  it('answers a blob that could not be read as still for a while, and as unknown after, so it is asked about again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const unreadable = {
      type: 'image/png',
      size: 100,
      slice: () => ({
        arrayBuffer: async () => {
          throw new Error('gone');
        },
      }),
    } as unknown as Blob;

    await blobMoves(unreadable);
    expect(knownBlobMoves(unreadable)).toBe(false);

    vi.setSystemTime(Date.now() + 30_000);
    expect(knownBlobMoves(unreadable)).toBeUndefined();
  });
});
