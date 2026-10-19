import { compressIfSmaller, COMPRESSION_THRESHOLD_BYTES, splitAtFileChunks } from '@axe/core/network/frame-codec';
import { decompressAsync } from '@axe/core/util/compress';

describe('frame codec', () => {
  describe('compressIfSmaller', () => {
    it('leaves a small batch as it is', async () => {
      const bytes = new Uint8Array(COMPRESSION_THRESHOLD_BYTES).fill(7);

      const result = await compressIfSmaller(bytes);

      expect(result.compressed).toBe(false);
      expect(result.bytes).toBe(bytes);
    });

    it('gzips a large batch that shrinks, and the bytes read back the same', async () => {
      const bytes = new Uint8Array(COMPRESSION_THRESHOLD_BYTES * 4).fill(7);

      const result = await compressIfSmaller(bytes);

      expect(result.compressed).toBe(true);
      expect(result.bytes.byteLength).toBeLessThan(bytes.byteLength);
      expect(await decompressAsync(result.bytes)).toEqual(bytes);
    });

    it('sends a large batch that gzip cannot shrink as it is', async () => {
      const bytes = crypto.getRandomValues(new Uint8Array(COMPRESSION_THRESHOLD_BYTES * 4));

      const result = await compressIfSmaller(bytes);

      expect(result.compressed).toBe(false);
      expect(result.bytes).toBe(bytes);
    });
  });

  describe('splitAtFileChunks', () => {
    it('keeps the pieces of a file apart from the messages around them, in order', () => {
      const runs = splitAtFileChunks([
        { eventName: 'UPDATE_GAME_OBJECT' },
        { eventName: 'FILE_SEND_CHUNK_IMAGE' },
        { eventName: 'FILE_SEND_CHUNK_IMAGE' },
        { eventName: 'CHAT' },
      ]);

      expect(runs.map((run) => [run.messages.length, run.carriesFileChunks])).toEqual([
        [1, false],
        [2, true],
        [1, false],
      ]);
    });
  });
});
