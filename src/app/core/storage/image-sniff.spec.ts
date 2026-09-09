import { looksLikeImage } from '@axe/core/storage/image-sniff';

function bytes(...values: number[]): Blob {
  return new Blob([new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0])]);
}

describe('whether bytes begin like a picture', () => {
  it('knows the formats a browser will draw', async () => {
    expect(await looksLikeImage(bytes(0x89, 0x50, 0x4e, 0x47))).toBe(true);
    expect(await looksLikeImage(bytes(0xff, 0xd8, 0xff))).toBe(true);
    expect(await looksLikeImage(bytes(0x47, 0x49, 0x46, 0x38))).toBe(true);
    expect(await looksLikeImage(bytes(0x42, 0x4d))).toBe(true);
  });

  it('knows a webp by the tag inside its container', async () => {
    const webp = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])]);
    const other = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20])]);

    expect(await looksLikeImage(webp)).toBe(true);
    expect(await looksLikeImage(other)).toBe(false);
  });

  function boxed(brand: string): Blob {
    const head = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((letter) => letter.charCodeAt(0))];
    return new Blob([new Uint8Array(head)]);
  }

  it('knows the boxed pictures by the brand inside their ftyp', async () => {
    for (const brand of ['avif', 'heic', 'mif1', 'msf1']) {
      expect(await looksLikeImage(boxed(brand))).toBe(true);
    }
  });

  /**
   * A film heads with the same box, and a zip entry is typed by its name, so `layer.png`
   * holding an mp4 would otherwise be stored as a layer that draws nothing.
   */
  it('turns away a film wearing the same box', async () => {
    for (const brand of ['isom', 'mp42', 'qt  ', 'M4V ']) {
      expect(await looksLikeImage(boxed(brand))).toBe(false);
    }
  });

  it('turns away anything else, whatever it is called', async () => {
    expect(await looksLikeImage(new Blob(['plain text'], { type: 'image/webp' }))).toBe(false);
    expect(await looksLikeImage(new Blob(['{}'], { type: 'image/png' }))).toBe(false);
  });

  it('turns away bytes too few to say anything', async () => {
    expect(await looksLikeImage(new Blob([new Uint8Array([0x89])]))).toBe(false);
    expect(await looksLikeImage(new Blob([]))).toBe(false);
  });
});
