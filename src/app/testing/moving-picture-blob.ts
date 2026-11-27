/**
 * The head of an APNG, which says it moves before any of its pixels: enough for a blob to be told to
 * move (see `blobMoves`), as a still PNG of a single byte is not.
 */
export function movingPngBlob(): Blob {
  const chunk = (name: string, length: number) => [
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...[...name].map((char) => char.charCodeAt(0)),
  ];
  const bytes = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', 13),
    ...new Array(13 + 4).fill(0),
    ...chunk('acTL', 8),
    ...new Array(8 + 4).fill(0),
  ];
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}
