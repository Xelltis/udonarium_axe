import { MapScene, ReliefLayer } from '@axe/domain/map-editor/scene';
import { applyGroundDab, GroundBrushKind, GroundDab } from '@axe/domain/tabletop/ground/ground-brush';
import {
  decodeGroundHeights,
  encodeGroundHeights,
  GROUND_CHUNK_SAMPLE_COUNT,
  GroundChunkData,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

/** The name a relief layer brought in from a table goes by. */
export const IMPORTED_RELIEF_LAYER_NAME = 'relief';

/** What the relief brush does: any stroke of the ground brush but paint, which is left to the table. */
export type ReliefBrushKind = Exclude<GroundBrushKind, 'paint'>;

export const RELIEF_BRUSH_KINDS: readonly ReliefBrushKind[] = ['raise', 'lower', 'smooth', 'flatten'];

/** How the relief brush shapes the ground: what it does, how far it reaches and how hard, in cells. */
export interface ReliefBrush {
  readonly kind: ReliefBrushKind;
  readonly radius: number;
  readonly strength: number;
}

const HEIGHT_LIMIT = 32767;

function keyOf(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function isFlat(heights: Int16Array): boolean {
  return heights.every((height) => height === 0);
}

/** The chunks a relief layer keeps, read back and unpainted; a chunk whose text does not read is left out. */
export function reliefChunksOf(layer: ReliefLayer): GroundChunkData[] {
  const chunks: GroundChunkData[] = [];
  for (const [key, text] of Object.entries(layer.chunks)) {
    const [cx, cy] = key.split(',').map(Number);
    const heights = decodeGroundHeights(text);
    if (heights && Number.isInteger(cx) && Number.isInteger(cy)) chunks.push({ cx, cy, heights, paint: null });
  }
  return chunks;
}

/** Keeps chunks on a relief layer, each in place of the one it was, and none of them that are flat. */
function keepOn(layer: ReliefLayer, chunks: readonly GroundChunkData[]): void {
  for (const chunk of chunks) {
    const key = keyOf(chunk.cx, chunk.cy);
    if (isFlat(chunk.heights)) delete layer.chunks[key];
    else layer.chunks[key] = encodeGroundHeights(chunk.heights);
  }
}

/** Lays a dab of the ground brush on a relief layer, on its own heights and none of the others'. */
export function dabRelief(layer: ReliefLayer, dab: GroundDab): void {
  keepOn(layer, applyGroundDab(reliefChunksOf(layer), dab));
}

/**
 * The heights every relief layer of a scene comes to together, a chunk at a time. A hidden layer
 * counts all the same, as one of functions does: hiding one is a way of looking under it.
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
      summed.set(key, { ...held, heights });
    }
  }
  return [...summed.values()].filter((chunk) => !isFlat(chunk.heights));
}

/** Whether a scene holds a relief layer, or held one and had it taken away, which says the ground is flat. */
export function sceneSpeaksForRelief(scene: MapScene): boolean {
  return scene.paintedRelief === true || scene.layers.some((layer) => layer.kind === 'relief');
}

/** A relief layer holding the heights of a table's ground, or none where the ground is flat. */
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
  keepOn(layer, chunks);
  return Object.keys(layer.chunks).length > 0 ? layer : null;
}

/**
 * The chunks a table's ground has to be written to for it to stand as a scene's relief does: each
 * chunk whose heights differ, made over with the paint the table already wears there, and each chunk
 * the table raises that the scene leaves flat, flattened with its paint kept. The paint is the
 * table's own to keep, since the editor shapes the ground and does not paint it.
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
    if (held && sameHeights(held.heights, chunk.heights)) continue;
    written.push({ cx: chunk.cx, cy: chunk.cy, heights: chunk.heights, paint: held?.paint ?? null });
  }
  for (const [key, held] of keptAt) {
    if (seen.has(key) || isFlat(held.heights)) continue;
    written.push({ cx: held.cx, cy: held.cy, heights: new Int16Array(GROUND_CHUNK_SAMPLE_COUNT), paint: held.paint });
  }
  return written;
}

function sameHeights(a: Int16Array, b: Int16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
