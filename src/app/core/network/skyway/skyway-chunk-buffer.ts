export interface DataChunk {
  id: string;
  data: Uint8Array;
  index: number;
  total: number;
}

interface ReceivedChunk {
  chunks: Uint8Array[];
  length: number;
  byteLength: number;
  createdAt: number;
}

const CHUNK_TTL_MS = 30000;

export class ChunkBuffer {
  private receivedMap: Map<string, ReceivedChunk> = new Map();

  /**
   * Add a chunk. Returns the fully assembled Uint8Array when all chunks have
   * arrived, or null if the message is still incomplete.
   */
  add(chunk: DataChunk): Uint8Array | null {
    let received = this.receivedMap.get(chunk.id);
    if (received == null) {
      this.evictStale();
      received = {
        chunks: new Array(chunk.total),
        length: 0,
        byteLength: 0,
        createdAt: performance.now(),
      };
      this.receivedMap.set(chunk.id, received);
    }

    if (received.chunks[chunk.index] != null) return null;

    received.length++;
    received.byteLength += chunk.data.byteLength;
    received.chunks[chunk.index] = chunk.data;

    if (received.length < chunk.total) return null;
    this.receivedMap.delete(chunk.id);

    const uint8Array = new Uint8Array(received.byteLength);
    let pos = 0;
    for (const c of received.chunks) {
      uint8Array.set(c, pos);
      pos += c.byteLength;
    }
    return uint8Array;
  }

  /** Drops every partly received message, as when the stream it came over is closed. */
  clear(): void {
    this.receivedMap.clear();
  }

  private evictStale(): void {
    const now = performance.now();
    for (const [id, received] of this.receivedMap) {
      if (now - received.createdAt > CHUNK_TTL_MS) {
        this.receivedMap.delete(id);
      }
    }
  }
}
