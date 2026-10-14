import { compressAsync } from '@axe/core/util/compress';

/** Below this many bytes a batch goes out as it is: gzip's own header would eat what it saves. */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

/**
 * Gzips encoded bytes when there are more than the threshold and gzip makes them smaller, which
 * every transport does the same way. Bytes that do not shrink, or that gzip fails on, are handed
 * back as they are.
 */
export async function compressIfSmaller(bytes: Uint8Array): Promise<{ bytes: Uint8Array; compressed: boolean }> {
  if (bytes.byteLength <= COMPRESSION_THRESHOLD_BYTES) return { bytes, compressed: false };
  try {
    const compressed = await compressAsync(bytes);
    if (compressed.byteLength < bytes.byteLength) return { bytes: compressed, compressed: true };
  } catch {
    // sends it uncompressed when compression fails
  }
  return { bytes, compressed: false };
}

/** A stretch of a batch that is either all pieces of an image or audio file, or none. */
export interface BatchRun {
  messages: unknown[];
  carriesFileChunks: boolean;
}

/**
 * Splits a batch, in order, into runs that are all pieces of an image or audio file or none.
 *
 * Those bytes are already compressed, so gzipping them costs time and saves nothing, while the
 * messages around them still compress well.
 */
export function splitAtFileChunks(batch: readonly unknown[]): BatchRun[] {
  const runs: BatchRun[] = [];
  for (const message of batch) {
    const eventName = (message as { eventName?: unknown } | null)?.eventName;
    const isFileChunk = typeof eventName === 'string' && eventName.startsWith('FILE_SEND_CHUNK_');
    const last = runs.at(-1);
    if (last && last.carriesFileChunks === isFileChunk) {
      last.messages.push(message);
    } else {
      runs.push({ messages: [message], carriesFileChunks: isFileChunk });
    }
  }
  return runs;
}
