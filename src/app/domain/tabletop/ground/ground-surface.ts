import {
  GROUND_CHUNK_SAMPLES,
  GROUND_HEIGHT_STEP,
  GROUND_SAMPLES_PER_CELL,
  GroundChunkData,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

/** A box of samples, from its top left to its bottom right sample, both taken in. */
export interface SampleBox {
  readonly i0: number;
  readonly j0: number;
  readonly i1: number;
  readonly j1: number;
}

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
  /**
   * The samples the ground may stand off the board at, every sample outside standing at 0, or null
   * where it stands on the board everywhere.
   */
  readonly extent: SampleBox | null;
  /**
   * How high the lowest of the samples in a box stands, in cells, or Infinity for a box of none.
   * Missing where it is to be found sample by sample.
   */
  lowestSampleIn?(box: SampleBox): number;
}

/** The ground that rises and sinks nowhere. */
export const FLAT_GROUND: GroundSurface = {
  isFlat: true,
  sampleAt: () => 0,
  paintAt: () => null,
  heightAt: () => 0,
  extent: null,
  lowestSampleIn: (box) => (box.i0 <= box.i1 && box.j0 <= box.j1 ? 0 : Infinity),
};

/** A chunk of heights as a surface keeps it, with the lowest of them once it has been asked for. */
interface KeptHeights {
  readonly cx: number;
  readonly cy: number;
  readonly heights: Int16Array;
  lowest: number | null;
}

/** The key a chunk is kept under in a surface. */
function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** The ground made of the chunks given; a chunk given twice is read as the last of them. */
export function groundSurfaceOf(chunks: Iterable<GroundChunkData>): GroundSurface {
  const byKey = new Map<string, KeptHeights>();
  const paintByKey = new Map<string, Uint8Array>();
  let raised = false;
  for (const chunk of chunks) {
    byKey.set(chunkKey(chunk.cx, chunk.cy), { cx: chunk.cx, cy: chunk.cy, heights: chunk.heights, lowest: null });
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
    const kept = byKey.get(chunkKey(cx, cy));
    if (!kept) return 0;
    const across = i - cx * GROUND_CHUNK_SAMPLES;
    const down = j - cy * GROUND_CHUNK_SAMPLES;
    return kept.heights[down * GROUND_CHUNK_SAMPLES + across] * GROUND_HEIGHT_STEP;
  };
  const onBoard = [...byKey.values()].filter((kept) => kept.cx >= 0 && kept.cy >= 0);
  return {
    isFlat: false,
    sampleAt,
    paintAt,
    heightAt: (x, y) => heightBetweenSamples(sampleAt, x * GROUND_SAMPLES_PER_CELL, y * GROUND_SAMPLES_PER_CELL),
    extent: extentOf(onBoard),
    lowestSampleIn: (box) => lowestKeptSampleIn(onBoard, byKey, box),
  };
}

/** The samples the chunks kept on the board cover, from the top left of the first to the bottom right of the last. */
function extentOf(kept: readonly KeptHeights[]): SampleBox | null {
  if (kept.length < 1) return null;
  const last = GROUND_CHUNK_SAMPLES - 1;
  return {
    i0: Math.min(...kept.map((chunk) => chunk.cx)) * GROUND_CHUNK_SAMPLES,
    j0: Math.min(...kept.map((chunk) => chunk.cy)) * GROUND_CHUNK_SAMPLES,
    i1: Math.max(...kept.map((chunk) => chunk.cx)) * GROUND_CHUNK_SAMPLES + last,
    j1: Math.max(...kept.map((chunk) => chunk.cy)) * GROUND_CHUNK_SAMPLES + last,
  };
}

/** The lowest height a chunk keeps, in steps, worked out the first time it is asked for. */
function lowestOfChunk(kept: KeptHeights): number {
  kept.lowest ??= kept.heights.reduce((lowest, height) => Math.min(lowest, height), Infinity);
  return kept.lowest;
}

/** The lowest of a chunk's samples inside a box, in steps, or Infinity where the box misses the chunk. */
function lowestOfChunkIn(kept: KeptHeights, box: SampleBox): number {
  const left = kept.cx * GROUND_CHUNK_SAMPLES;
  const top = kept.cy * GROUND_CHUNK_SAMPLES;
  const last = GROUND_CHUNK_SAMPLES - 1;
  const a0 = Math.max(box.i0, left) - left;
  const a1 = Math.min(box.i1, left + last) - left;
  const b0 = Math.max(box.j0, top) - top;
  const b1 = Math.min(box.j1, top + last) - top;
  if (a0 > a1 || b0 > b1) return Infinity;
  if (a0 === 0 && b0 === 0 && a1 === last && b1 === last) return lowestOfChunk(kept);
  let lowest = Infinity;
  for (let b = b0; b <= b1; b++) {
    for (let a = a0; a <= a1; a++) lowest = Math.min(lowest, kept.heights[b * GROUND_CHUNK_SAMPLES + a]);
  }
  return lowest;
}

/**
 * The lowest of the samples in a box, in cells, from the chunks kept on the board: a chunk wholly in
 * the box by the lowest it keeps, one partly in it sample by sample, and any sample off the board or
 * in no chunk at 0. The chunks the box reaches are looked up one by one, or, where the box reaches
 * more chunks than are kept, the kept ones are gone over instead.
 */
function lowestKeptSampleIn(
  onBoard: readonly KeptHeights[],
  byKey: ReadonlyMap<string, KeptHeights>,
  box: SampleBox
): number {
  if (!(box.i0 <= box.i1 && box.j0 <= box.j1)) return Infinity;
  let lowest = box.i0 < 0 || box.j0 < 0 ? 0 : Infinity;
  const inside = { i0: Math.max(0, box.i0), j0: Math.max(0, box.j0), i1: box.i1, j1: box.j1 };
  if (!(inside.i0 <= inside.i1 && inside.j0 <= inside.j1)) return lowest;
  const cx0 = Math.floor(inside.i0 / GROUND_CHUNK_SAMPLES);
  const cy0 = Math.floor(inside.j0 / GROUND_CHUNK_SAMPLES);
  const cx1 = Math.floor(inside.i1 / GROUND_CHUNK_SAMPLES);
  const cy1 = Math.floor(inside.j1 / GROUND_CHUNK_SAMPLES);
  const reached = (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
  const found = reached > onBoard.length ? keptAmong(onBoard, cx0, cy0, cx1, cy1) : keptAt(byKey, cx0, cy0, cx1, cy1);
  for (const kept of found) lowest = Math.min(lowest, lowestOfChunkIn(kept, inside) * GROUND_HEIGHT_STEP);
  return found.length < reached ? Math.min(lowest, 0) : lowest;
}

/** The chunks kept from one corner chunk to another, gone over one by one. */
function keptAmong(onBoard: readonly KeptHeights[], cx0: number, cy0: number, cx1: number, cy1: number): KeptHeights[] {
  return onBoard.filter((kept) => kept.cx >= cx0 && kept.cx <= cx1 && kept.cy >= cy0 && kept.cy <= cy1);
}

/** The chunks kept from one corner chunk to another, looked up by place. */
function keptAt(
  byKey: ReadonlyMap<string, KeptHeights>,
  cx0: number,
  cy0: number,
  cx1: number,
  cy1: number
): KeptHeights[] {
  const found: KeptHeights[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const kept = byKey.get(chunkKey(cx, cy));
      if (kept) found.push(kept);
    }
  }
  return found;
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

/** The lowest of the samples in a box read one by one, for a surface that cannot tell it otherwise. */
export function lowestSampleOneByOne(sampleAt: (i: number, j: number) => number, box: SampleBox): number {
  let lowest = Infinity;
  for (let j = box.j0; j <= box.j1; j++) {
    for (let i = box.i0; i <= box.i1; i++) lowest = Math.min(lowest, sampleAt(i, j));
  }
  return lowest;
}

/**
 * Visits the points on the edges of a box, counted in samples, at which the ground can turn: its
 * corners, where each edge crosses a line between samples, and where it crosses the diagonal each
 * square of samples is split along. Between them the ground along an edge runs straight.
 */
function visitEdgePoints(
  i0: number,
  j0: number,
  i1: number,
  j1: number,
  visit: (si: number, sj: number) => void
): void {
  for (const j of [j0, j1]) {
    visit(i0, j);
    visit(i1, j);
    for (let i = Math.ceil(i0); i <= i1; i++) visit(i, j);
    for (let k = Math.ceil(i0 - j); k <= i1 - j; k++) visit(j + k, j);
  }
  for (const i of [i0, i1]) {
    for (let j = Math.ceil(j0); j <= j1; j++) visit(i, j);
    for (let k = Math.ceil(i - j1); k <= i - j0; k++) visit(i, i - k);
  }
}

/**
 * How far the ground under a box of the board lifts what stands on it, in table pixels: the lowest the
 * ground stands anywhere in the box, so that a block stood on uneven ground sinks into the rise rather
 * than hanging over the dip. The ground is flat across each triangle of samples, so the lowest is at a
 * sample inside the box or at a point where its edges cross the triangles. Beyond the samples the
 * ground may stand off the board at, and the sample on from them where it slopes back to the board,
 * it stands at 0, so only the part of the box over them is read, and a block reaching past them is
 * weighed in a moment however vast it is.
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
  const perPx = GROUND_SAMPLES_PER_CELL / gridSize;
  const i0 = x * perPx;
  const j0 = y * perPx;
  const i1 = i0 + (width > 0 ? width * perPx : 0);
  const j1 = j0 + (height > 0 ? height * perPx : 0);
  if ([i0, j0, i1, j1].some(Number.isNaN)) return 0;
  const extent = ground.extent;
  if (extent === null) return 0;
  const reach = { i0: extent.i0 - 1, j0: extent.j0 - 1, i1: extent.i1 + 1, j1: extent.j1 + 1 };
  let lowest = i0 < reach.i0 || j0 < reach.j0 || i1 > reach.i1 || j1 > reach.j1 ? 0 : Infinity;
  const box: SampleBox = {
    i0: Math.max(i0, reach.i0),
    j0: Math.max(j0, reach.j0),
    i1: Math.min(i1, reach.i1),
    j1: Math.min(j1, reach.j1),
  };
  if (!(box.i0 <= box.i1 && box.j0 <= box.j1)) return lowest * gridSize;
  const samples: SampleBox = {
    i0: Math.ceil(box.i0),
    j0: Math.ceil(box.j0),
    i1: Math.floor(box.i1),
    j1: Math.floor(box.j1),
  };
  if (samples.i0 <= samples.i1 && samples.j0 <= samples.j1) {
    lowest = Math.min(lowest, ground.lowestSampleIn?.(samples) ?? lowestSampleOneByOne(ground.sampleAt, samples));
  }
  visitEdgePoints(box.i0, box.j0, box.i1, box.j1, (si, sj) => {
    lowest = Math.min(lowest, heightBetweenSamples(ground.sampleAt, si, sj));
  });
  return lowest * gridSize;
}

/**
 * How far the ground lifts a block on the floor, in table pixels: the lowest it stands under the box
 * the block's footprint covers as it is turned about its middle. A block turned a quarter is read
 * over its footprint exactly; one turned off the square over the box squared up round it, so that it
 * sinks a little into a rise beside it rather than hanging over a dip under it.
 */
export function groundLiftOfBlock(
  ground: GroundSurface,
  gridSize: number,
  block: {
    readonly location: { readonly x: number; readonly y: number };
    readonly width: number;
    readonly depth: number;
    readonly rotate?: number;
  }
): number {
  const width = block.width * gridSize;
  const depth = block.depth * gridSize;
  const turn = (((block.rotate ?? 0) % 180) + 180) % 180;
  if (turn === 0 || !Number.isFinite(turn)) {
    return lowestGroundPxIn(ground, gridSize, block.location.x, block.location.y, width, depth);
  }
  const radians = (turn * Math.PI) / 180;
  const across = Math.abs(width * Math.cos(radians)) + Math.abs(depth * Math.sin(radians));
  const down = Math.abs(width * Math.sin(radians)) + Math.abs(depth * Math.cos(radians));
  const middleX = block.location.x + width / 2;
  const middleY = block.location.y + depth / 2;
  return lowestGroundPxIn(ground, gridSize, middleX - across / 2, middleY - down / 2, across, down);
}
