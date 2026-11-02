import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  decodeGroundHeights,
  decodeGroundPaint,
  encodeGroundHeights,
  encodeGroundPaint,
  GroundChunkData,
  readGroundChunkIndex,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

/**
 * A chunk of a table's ground: sixteen cells square, raised, sunk and painted.
 *
 * Which chunk it is is kept as well as its heights, since a copy of the table gives every object an
 * identifier of its own. Every field is text, so that one reaching here with nothing in it names no
 * chunk and holds no data, rather than the flat chunk at the board's corner.
 */
@SyncObject('ground-chunk')
export class GroundChunk extends ObjectNode {
  @SyncVar() cx: string = '';
  @SyncVar() cy: string = '';
  @SyncVar() heights: string = '';
  @SyncVar() paint: string = '';

  /** The chunk as it is kept, or null where it names no chunk or holds no heights. */
  read(): GroundChunkData | null {
    const cx = readGroundChunkIndex(this.cx);
    const cy = readGroundChunkIndex(this.cy);
    const heights = decodeGroundHeights(this.heights);
    if (cx === null || cy === null || !heights) return null;
    return { cx, cy, heights, paint: decodeGroundPaint(this.paint) };
  }

  /** Keeps the heights and the paint given. The change syncs to every peer. */
  write(heights: Int16Array, paint: Uint8Array | null): void {
    this.heights = encodeGroundHeights(heights);
    this.paint = paint ? encodeGroundPaint(paint) : '';
  }
}

/**
 * The raised, sunk and painted ground of a table, as the chunks hanging on it.
 *
 * A table with none is flat. A version that knows nothing of the ground passes over it, so the table
 * shows flat there; what stands on the ground is lifted where it is drawn and judged, never in what it
 * keeps, so a piece shown there does not float or sink.
 */
@SyncObject('ground-field')
export class GroundField extends ObjectNode {
  /** The chunks kept, each read as it is kept, passing over any that names no chunk or holds no heights. */
  readChunks(): GroundChunkData[] {
    return this.chunks()
      .map((chunk) => chunk.read())
      .filter((chunk): chunk is GroundChunkData => chunk !== null);
  }

  /** The chunk kept for a place, or null. */
  chunkAt(cx: number, cy: number): GroundChunk | null {
    return (
      this.chunks().find((chunk) => readGroundChunkIndex(chunk.cx) === cx && readGroundChunkIndex(chunk.cy) === cy) ??
      null
    );
  }

  /**
   * Keeps the heights and the paint of a chunk, making the chunk under a name of its own where none is
   * kept. A chunk once made is kept, made flat again rather than taken away, since a name taken away
   * cannot be given to another.
   */
  writeChunk(data: GroundChunkData): void {
    let chunk = this.chunkAt(data.cx, data.cy);
    if (!chunk) {
      chunk = new GroundChunk(`${this.identifier}_${data.cx}_${data.cy}`);
      chunk.initialize();
      chunk.cx = String(data.cx);
      chunk.cy = String(data.cy);
      this.appendChild(chunk);
    }
    chunk.write(data.heights, data.paint);
  }

  private chunks(): GroundChunk[] {
    return this.children.filter((child): child is GroundChunk => child instanceof GroundChunk);
  }
}

/** The ground hanging on a table, or null when none has been made yet. */
export function groundFieldOn(table: GameTable): GroundField | null {
  return table.children.find((child): child is GroundField => child instanceof GroundField) ?? null;
}

/**
 * The name the ground of a table goes under: the table's own, so that two seats raising the ground at
 * once make the one ground rather than hanging two on the table.
 */
export function groundFieldIdentifierOf(table: GameTable): string {
  return `ground-field_${table.identifier}`;
}

/** The ground hanging on a table, made under the table's name when there is none. It syncs to every peer. */
export function ensureGroundFieldOn(table: GameTable): GroundField {
  const held = groundFieldOn(table);
  if (held) return held;
  const field = new GroundField(groundFieldIdentifierOf(table));
  field.initialize();
  table.appendChild(field);
  return field;
}
