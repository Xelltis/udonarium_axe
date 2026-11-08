import { MapScene, ReliefLayer } from '@axe/domain/map-editor/scene';
import { applyGroundDab, GroundBrushKind, GroundDab } from '@axe/domain/tabletop/ground/ground-brush';
import {
  decodeGroundHeights,
  decodeGroundPaint,
  encodeGroundHeights,
  encodeGroundPaint,
  GROUND_CHUNK_SAMPLE_COUNT,
  GROUND_PAINT_LAYERS,
  GroundChunkData,
  GroundPaintLayer,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

/** The name a relief layer brought in from a table goes by. */
export const IMPORTED_RELIEF_LAYER_NAME = 'relief';

/** What the relief brush does: any stroke of the ground brush, shaping the ground or painting it. */
export type ReliefBrushKind = GroundBrushKind;

export const RELIEF_BRUSH_KINDS: readonly ReliefBrushKind[] = ['raise', 'lower', 'smooth', 'flatten', 'paint', 'erase'];

/**
 * How the relief brush works the ground: what it does, how far it reaches and how hard, in cells,
 * and the kind of ground it paints.
 */
export interface ReliefBrush {
  readonly kind: ReliefBrushKind;
  readonly radius: number;
  readonly strength: number;
  readonly layer: GroundPaintLayer;
}

const HEIGHT_LIMIT = 32767;

function keyOf(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function isFlat(heights: Int16Array): boolean {
  return heights.every((height) => height === 0);
}

/** Whether paint lays any kind of ground anywhere. */
function isPainted(paint: Uint8Array | null): paint is Uint8Array {
  return paint !== null && paint.some((share) => share > 0);
}

/**
 * The chunks a relief layer keeps, read back with the paint it lays on each, or none where it paints
 * nothing there; a chunk whose heights do not read is left out, and one it only paints stands flat.
 */
export function reliefChunksOf(layer: ReliefLayer): GroundChunkData[] {
  const chunks: GroundChunkData[] = [];
  const painted = layer.paint ?? {};
  for (const key of new Set([...Object.keys(layer.chunks), ...Object.keys(painted)])) {
    const [cx, cy] = key.split(',').map(Number);
    if (!Number.isInteger(cx) || !Number.isInteger(cy)) continue;
    const text = layer.chunks[key];
    const heights = text === undefined ? new Int16Array(GROUND_CHUNK_SAMPLE_COUNT) : decodeGroundHeights(text);
    const paint = painted[key] === undefined ? null : decodeGroundPaint(painted[key]);
    if (heights && (text !== undefined || paint)) chunks.push({ cx, cy, heights, paint });
  }
  return chunks;
}

/**
 * Keeps chunks on a relief layer, each in place of the one it was: the heights of none of them that
 * are flat, and the paint of each that a stroke has painted or erased, so that the layer still says
 * the ground there is to wear nothing.
 */
function keepOn(layer: ReliefLayer, chunks: readonly GroundChunkData[]): void {
  for (const chunk of chunks) {
    const key = keyOf(chunk.cx, chunk.cy);
    if (isFlat(chunk.heights)) delete layer.chunks[key];
    else layer.chunks[key] = encodeGroundHeights(chunk.heights);
    if (chunk.paint) (layer.paint ??= {})[key] = encodeGroundPaint(chunk.paint);
    else if (layer.paint) delete layer.paint[key];
  }
}

/** Lays a dab of the ground brush on a relief layer, on its own heights and none of the others'. */
export function dabRelief(layer: ReliefLayer, dab: GroundDab): void {
  keepOn(layer, applyGroundDab(reliefChunksOf(layer), dab));
}

/**
 * The paint two layers lay on a chunk together: where the upper one paints a sample, its paint, and
 * elsewhere the lower one's.
 */
function paintOver(lower: Uint8Array | null, upper: Uint8Array | null): Uint8Array | null {
  if (!lower || !upper) return upper ?? lower;
  const kinds = GROUND_PAINT_LAYERS.length;
  const laid = lower.slice();
  for (let sample = 0; sample < GROUND_CHUNK_SAMPLE_COUNT; sample++) {
    const shares = upper.subarray(sample * kinds, sample * kinds + kinds);
    if (shares.some((share) => share > 0)) laid.set(shares, sample * kinds);
  }
  return laid;
}

/**
 * The ground every relief layer of a scene comes to together, a chunk at a time: the heights added
 * up, and the paint of a layer laid over the paint of those under it. A hidden layer counts all the
 * same, as one of functions does: hiding one is a way of looking under it. A chunk is left out where
 * it stands flat and no layer paints or erases it.
 */
export function sceneReliefChunks(scene: MapScene): GroundChunkData[] {
  const summed = new Map<string, GroundChunkData>();
  for (const layer of scene.layers) {
    if (layer.kind !== 'relief') continue;
    for (const chunk of reliefChunksOf(layer)) {
      const key = keyOf(chunk.cx, chunk.cy);
      const held = summed.get(key);
      if (!held) {
        summed.set(key, chunk);
        continue;
      }
      const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
      for (let i = 0; i < heights.length; i++) {
        heights[i] = Math.max(-HEIGHT_LIMIT, Math.min(HEIGHT_LIMIT, held.heights[i] + chunk.heights[i]));
      }
      summed.set(key, { ...held, heights, paint: paintOver(held.paint, chunk.paint) });
    }
  }
  return [...summed.values()].filter((chunk) => !isFlat(chunk.heights) || chunk.paint !== null);
}

/** Whether a scene holds a relief layer, or held one and had it taken away, which says the ground is flat. */
export function sceneSpeaksForRelief(scene: MapScene): boolean {
  return scene.paintedRelief === true || scene.layers.some((layer) => layer.kind === 'relief');
}

/**
 * A relief layer holding the heights and the paint of a table's ground, or none where the ground is
 * flat and painted nowhere.
 */
export function reliefLayerOf(id: string, chunks: readonly GroundChunkData[]): ReliefLayer | null {
  const layer: ReliefLayer = {
    id,
    kind: 'relief',
    name: IMPORTED_RELIEF_LAYER_NAME,
    visible: true,
    locked: false,
    opacity: 1,
    chunks: {},
  };
  keepOn(
    layer,
    chunks.map((chunk) => (isPainted(chunk.paint) ? chunk : { ...chunk, paint: null }))
  );
  return Object.keys(layer.chunks).length > 0 || Object.keys(layer.paint ?? {}).length > 0 ? layer : null;
}

/**
 * The chunks a table's ground has to be written to for it to stand as a scene's relief does: each
 * chunk whose heights or paint differ, and each chunk the table raises that the scene leaves flat,
 * flattened. Where the scene paints a chunk, or erases it, its paint is written; elsewhere the table
 * keeps the paint it wears.
 */
export function groundChangeOf(
  wanted: readonly GroundChunkData[],
  kept: readonly GroundChunkData[]
): GroundChunkData[] {
  const keptAt = new Map(kept.map((chunk) => [keyOf(chunk.cx, chunk.cy), chunk]));
  const written: GroundChunkData[] = [];
  const seen = new Set<string>();
  for (const chunk of wanted) {
    const key = keyOf(chunk.cx, chunk.cy);
    seen.add(key);
    const held = keptAt.get(key);
    const paint = chunk.paint ?? held?.paint ?? null;
    if (held && sameHeights(held.heights, chunk.heights) && samePaint(held.paint, paint)) continue;
    if (!held && isFlat(chunk.heights) && !isPainted(paint)) continue;
    written.push({ cx: chunk.cx, cy: chunk.cy, heights: chunk.heights, paint });
  }
  for (const [key, held] of keptAt) {
    if (seen.has(key) || isFlat(held.heights)) continue;
    written.push({ cx: held.cx, cy: held.cy, heights: new Int16Array(GROUND_CHUNK_SAMPLE_COUNT), paint: held.paint });
  }
  return written;
}

/** Whether two chunks' paint lays the same ground, nothing and paint of nothing alike. */
function samePaint(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!isPainted(a) || !isPainted(b)) return !isPainted(a) && !isPainted(b);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameHeights(a: Int16Array, b: Int16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
