import { compressAsync, decompressAsync } from '@axe/core/util/compress';

describe('compress', () => {
  describe('compressAsync()', () => {
    it('compresses bytes into bytes', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const compressed = await compressAsync(data);
      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it('compresses something large', async () => {
      const data = new Uint8Array(10000);
      data.fill(65); // filled with 'A', which compresses well
      const compressed = await compressAsync(data);
      expect(compressed).toBeInstanceOf(Uint8Array);
      // repetitive data should come out smaller
      expect(compressed.length).toBeLessThan(data.length);
    });

    it('compresses nothing at all', async () => {
      const data = new Uint8Array(0);
      const compressed = await compressAsync(data);
      expect(compressed).toBeInstanceOf(Uint8Array);
    });

    it('compresses repetitive bytes into bytes', async () => {
      const data = new Uint8Array(1000);
      data.fill(66);
      const compressed = await compressAsync(data);
      expect(compressed).toBeInstanceOf(Uint8Array);
    });
  });

  describe('decompressAsync()', () => {
    it('decompresses back into bytes', async () => {
      const original = new Uint8Array([10, 20, 30, 40, 50]);
      const compressed = await compressAsync(original);
      const decompressed = await decompressAsync(compressed);
      expect(decompressed).toEqual(original);
    });

    it('decompresses repetitive data back to what it was', async () => {
      const original = new Uint8Array(1000);
      original.fill(67);
      const compressed = await compressAsync(original);
      const decompressed = await decompressAsync(compressed);
      expect(decompressed).toEqual(original);
    });
  });

  describe('the round trip', () => {
    it('text survives the round trip', async () => {
      const text = 'Hello, World! This is a test of compress/decompress.';
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const original = encoder.encode(text);
      const compressed = await compressAsync(original);
      const decompressed = await decompressAsync(compressed);

      expect(decoder.decode(decompressed)).toBe(text);
    });

    it('binary survives the round trip', async () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) original[i] = i;

      const compressed = await compressAsync(original);
      const decompressed = await decompressAsync(compressed);
      expect(decompressed).toEqual(original);
    });

    it('non-ascii text survives the round trip', async () => {
      const text = 'テスト日本語データの圧縮と解凍を確認します。';
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const original = encoder.encode(text);
      const compressed = await compressAsync(original);
      const decompressed = await decompressAsync(compressed);

      expect(decoder.decode(decompressed)).toBe(text);
    });
  });
});
