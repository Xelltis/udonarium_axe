import {
  decodeGroundHeights,
  decodeGroundPaint,
  encodeGroundHeights,
  encodeGroundPaint,
  GROUND_CHUNK_SAMPLE_COUNT,
  GROUND_PAINT_LAYERS,
  readGroundChunkIndex,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

describe('the heights of a chunk of the ground, as text', () => {
  it('reads back what it wrote, below the board as well as over it', () => {
    const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
    heights[0] = 64;
    heights[1] = -64;
    heights[2] = 32767;
    heights[GROUND_CHUNK_SAMPLE_COUNT - 1] = -32768;

    expect(decodeGroundHeights(encodeGroundHeights(heights))).toEqual(heights);
  });

  it('reads no data out of an empty text, or one cut short, rather than a flat chunk', () => {
    const text = encodeGroundHeights(new Int16Array(GROUND_CHUNK_SAMPLE_COUNT));

    expect(decodeGroundHeights('')).toBeNull();
    expect(decodeGroundHeights(text.slice(0, text.length / 2))).toBeNull();
  });
});

describe('the paint of a chunk of the ground, as text', () => {
  it('reads back each share of each sample, in four bits', () => {
    const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * GROUND_PAINT_LAYERS.length);
    paint.set([15, 0, 7, 3], 0);
    paint.set([1, 2, 3, 4], 4);

    const read = decodeGroundPaint(encodeGroundPaint(paint))!;

    expect([...read.subarray(0, 8)]).toEqual([15, 0, 7, 3, 1, 2, 3, 4]);
  });

  it('keeps a share past full at full', () => {
    const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * GROUND_PAINT_LAYERS.length);
    paint[0] = 200;

    expect(decodeGroundPaint(encodeGroundPaint(paint))![0]).toBe(15);
  });

  it('reads no paint out of an empty text', () => {
    expect(decodeGroundPaint('')).toBeNull();
  });
});

describe('which chunk a chunk is', () => {
  it('reads a whole number of chunks', () => {
    expect(readGroundChunkIndex('3')).toBe(3);
    expect(readGroundChunkIndex(' 12 ')).toBe(12);
    expect(readGroundChunkIndex('0')).toBe(0);
  });

  it('names no chunk for an empty text, or one that is no whole number of chunks, rather than the corner', () => {
    expect(readGroundChunkIndex('')).toBeNull();
    expect(readGroundChunkIndex('-1')).toBeNull();
    expect(readGroundChunkIndex('1.5')).toBeNull();
    expect(readGroundChunkIndex('a')).toBeNull();
  });
});
