import { blobFromStored, storedBytesOf } from '@axe/core/storage/stored-bytes';

describe('a file as IndexedDB keeps it', () => {
  it('is written as its bytes and type, and read back as the same file', async () => {
    const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

    const stored = await storedBytesOf(file);

    expect(stored).not.toBeInstanceOf(Blob);
    expect(stored.bytes).toBeInstanceOf(ArrayBuffer);
    const back = blobFromStored(stored)!;
    expect(back.type).toBe('image/png');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it('reads a file written as a Blob before files were kept as bytes', () => {
    const file = new Blob(['old'], { type: 'image/webp' });

    expect(blobFromStored(file)).toBe(file);
  });

  it('reads anything else as no file', () => {
    expect(blobFromStored(undefined)).toBeNull();
    expect(blobFromStored('bytes')).toBeNull();
    expect(blobFromStored({ type: 'image/png' })).toBeNull();
  });
});
