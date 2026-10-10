/**
 * A file's bytes and type as they are written to IndexedDB. WebKit will not store a Blob in a
 * session that keeps nothing once it is closed, as a private window does, but it does store bytes.
 */
export interface StoredBytes {
  readonly type: string;
  readonly bytes: ArrayBuffer;
}

/** A file as it is written to IndexedDB. */
export async function storedBytesOf(blob: Blob): Promise<StoredBytes> {
  return { type: blob.type, bytes: await blob.arrayBuffer() };
}

/**
 * A file read back from IndexedDB: made again from its bytes, or as it was where it was written as
 * a Blob before files were kept as bytes. Null for anything else.
 */
export function blobFromStored(stored: unknown): Blob | null {
  if (stored instanceof Blob) return stored;
  if (!stored || typeof stored !== 'object') return null;
  const { type, bytes } = stored as Partial<StoredBytes>;
  if (!(bytes instanceof ArrayBuffer)) return null;
  return new Blob([bytes], { type: typeof type === 'string' ? type : '' });
}
