import {
  GROUND_CHUNK_SAMPLES,
  GROUND_HEIGHT_STEP,
  GROUND_SAMPLES_PER_CELL,
  GroundChunkData,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

/**
 * The ground of a table, read from its chunks: how high it stands at any point, in cells over the
 * board. Where no chunk is kept the ground is the board itself.
 */
export interface GroundSurface {
  /** Whether the ground is the bare board: no chunk raises, sinks or paints it anywhere. */
  readonly isFlat: boolean;
  /** How high the sample a number of half cells across and down from the board's top left stands, in cells. */
  sampleAt(i: number, j: number): number;
  /**
   * The shares of paint a sample wears, four of them in the order of `GROUND_PAINT_LAYERS`, each out
   * of `GROUND_PAINT_FULL`, or null where it wears none.
   */
  paintAt(i: number, j: number): Uint8Array | null;
  /**
   * How high the ground stands at a point, in cells across and down from the board's top left. Between
   * samples each square of four is read as two triangles split from its top left to its bottom right
   * corner, as the ground is drawn, so a piece stands on the ground the reader sees.
   */
  heightAt(x: number, y: number): number;
}

/** The ground that rises and sinks nowhere. */
export const FLAT_GROUND: GroundSurface = {
  isFlat: true,
  sampleAt: () => 0,
  paintAt: () => null,
  heightAt: () => 0,
};

/** The key a chunk is kept under in a surface. */
function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** The ground made of the chunks given; a chunk given twice is read as the last of them. */
export function groundSurfaceOf(chunks: Iterable<GroundChunkData>): GroundSurface {
  const byKey = new Map<string, Int16Array>();
  const paintByKey = new Map<string, Uint8Array>();
  let raised = false;
  for (const chunk of chunks) {
    byKey.set(chunkKey(chunk.cx, chunk.cy), chunk.heights);
    if (chunk.paint) paintByKey.set(chunkKey(chunk.cx, chunk.cy), chunk.paint);
    else paintByKey.delete(chunkKey(chunk.cx, chunk.cy));
    if (!raised)
      raised = chunk.heights.some((height) => height !== 0) || chunk.paint?.some((share) => share > 0) === true;
  }
  if (!raised) return FLAT_GROUND;
  const paintAt = (i: number, j: number): Uint8Array | null => {
    if (i < 0 || j < 0) return null;
    const cx = Math.floor(i / GROUND_CHUNK_SAMPLES);
    const cy = Math.floor(j / GROUND_CHUNK_SAMPLES);
    const paint = paintByKey.get(chunkKey(cx, cy));
    if (!paint) return null;
    const at = ((j - cy * GROUND_CHUNK_SAMPLES) * GROUND_CHUNK_SAMPLES + (i - cx * GROUND_CHUNK_SAMPLES)) * 4;
    const shares = paint.subarray(at, at + 4);
    return shares.some((share) => share > 0) ? shares : null;
  };
  const sampleAt = (i: number, j: number): number => {
    if (i < 0 || j < 0) return 0;
    const cx = Math.floor(i / GROUND_CHUNK_SAMPLES);
    const cy = Math.floor(j / GROUND_CHUNK_SAMPLES);
    const heights = byKey.get(chunkKey(cx, cy));
    if (!heights) return 0;
    const across = i - cx * GROUND_CHUNK_SAMPLES;
    const down = j - cy * GROUND_CHUNK_SAMPLES;
    return heights[down * GROUND_CHUNK_SAMPLES + across] * GROUND_HEIGHT_STEP;
  };
  return {
    isFlat: false,
    sampleAt,
    paintAt,
    heightAt: (x, y) => heightBetweenSamples(sampleAt, x * GROUND_SAMPLES_PER_CELL, y * GROUND_SAMPLES_PER_CELL),
  };
}

/**
 * The height at a point counted in samples, from the four samples round it, read as the triangle of
 * them it lies in: the square is split along the line from its top left to its bottom right corner.
 */
export function heightBetweenSamples(sampleAt: (i: number, j: number) => number, si: number, sj: number): number {
  const i = Math.floor(si);
  const j = Math.floor(sj);
  const fx = si - i;
  const fy = sj - j;
  const topLeft = sampleAt(i, j);
  const bottomRight = sampleAt(i + 1, j + 1);
  if (fx >= fy) {
    const topRight = sampleAt(i + 1, j);
    return topLeft + fx * (topRight - topLeft) + fy * (bottomRight - topRight);
  }
  const bottomLeft = sampleAt(i, j + 1);
  return topLeft + fy * (bottomLeft - topLeft) + fx * (bottomRight - bottomLeft);
}

/**
 * How far the ground under a box of the board lifts what stands on it, in table pixels: the lowest the
 * ground stands anywhere in the box, so that a block stood on uneven ground sinks into the rise rather
 * than hanging over the dip. The box is read at its corners and every half cell along and across it.
 */
export function lowestGroundPxIn(
  ground: GroundSurface,
  gridSize: number,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  if (ground.isFlat || !(gridSize > 0)) return 0;
  const along = (length: number): number[] => {
    const at: number[] = [];
    for (let d = 0; d < length; d += gridSize / GROUND_SAMPLES_PER_CELL) at.push(d);
    return [...at, length];
  };
  let lowest = Infinity;
  for (const across of along(width)) {
    for (const down of along(height)) {
      lowest = Math.min(lowest, ground.heightAt((x + across) / gridSize, (y + down) / gridSize));
    }
  }
  return lowest * gridSize;
}

/** How far the ground lifts a block on the floor, in table pixels: the lowest it stands under the block's box. */
export function groundLiftOfBlock(
  ground: GroundSurface,
  gridSize: number,
  block: {
    readonly location: { readonly x: number; readonly y: number };
    readonly width: number;
    readonly depth: number;
  }
): number {
  return lowestGroundPxIn(
    ground,
    gridSize,
    block.location.x,
    block.location.y,
    block.width * gridSize,
    block.depth * gridSize
  );
}
