/** Gzips bytes with the browser's CompressionStream. */
export async function compressAsync(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Un-gzips bytes, rejecting when they are not gzip; `decompressIfNeeded` also takes uncompressed data. */
export async function decompressAsync(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The gzip magic number. */
const GZIP_MAGIC = [0x1f, 0x8b];

/** Whether the bytes begin with the gzip magic number. */
export function isCompressed(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === GZIP_MAGIC[0] && data[1] === GZIP_MAGIC[1];
}

/**
 * Decompresses when compressed and hands the bytes back otherwise.
 * It is what lets data written before compression still be read.
 */
export async function decompressIfNeeded(data: Uint8Array): Promise<Uint8Array> {
  return isCompressed(data) ? decompressAsync(data) : data;
}
