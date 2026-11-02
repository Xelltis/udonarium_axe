import {
  GROUND_CHUNK_SAMPLE_COUNT,
  GROUND_CHUNK_SAMPLES,
  GROUND_HEIGHT_STEP,
  GROUND_PAINT_FULL,
  GROUND_PAINT_LAYERS,
  GROUND_SAMPLES_PER_CELL,
  GroundChunkData,
  GroundPaintLayer,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

/** What a stroke of the brush does to the ground under it. */
export type GroundBrushKind = 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint';

/**
 * One dab of the brush: where it falls and how wide it is, in cells, and how hard it presses. Raising
 * and lowering move the ground by up to the strength, in cells, at the middle of the dab; smoothing,
 * flattening and painting take the ground that share of the way to where they lead it.
 */
export interface GroundDab {
  readonly kind: GroundBrushKind;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly strength: number;
  /** The height flattening levels the ground to, in cells. */
  readonly level?: number;
  /** The kind of ground painting lays. */
  readonly layer?: GroundPaintLayer;
}

const HEIGHT_LIMIT = 32767;

/** How hard a dab presses at a distance from its middle: fully there, easing to nothing at its edge. */
function falloff(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * distance) / radius));
}

/** The key a chunk is kept under while a dab works on it. */
function keyOf(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/**
 * The chunks a dab of the brush changes, made anew with the dab laid on them; the chunks given are
 * left as they were. A chunk the dab reaches that is not kept yet is made flat and unpainted first.
 * Samples off the board's top or left edge are left alone.
 */
export function applyGroundDab(chunks: readonly GroundChunkData[], dab: GroundDab): GroundChunkData[] {
  const held = new Map(chunks.map((chunk) => [keyOf(chunk.cx, chunk.cy), chunk]));
  const sampleAt = (i: number, j: number): number => {
    if (i < 0 || j < 0) return 0;
    const chunk = held.get(keyOf(Math.floor(i / GROUND_CHUNK_SAMPLES), Math.floor(j / GROUND_CHUNK_SAMPLES)));
    if (!chunk) return 0;
    return chunk.heights[(j % GROUND_CHUNK_SAMPLES) * GROUND_CHUNK_SAMPLES + (i % GROUND_CHUNK_SAMPLES)];
  };
  const reach = dab.radius * GROUND_SAMPLES_PER_CELL;
  const middleI = dab.x * GROUND_SAMPLES_PER_CELL;
  const middleJ = dab.y * GROUND_SAMPLES_PER_CELL;
  const changed = new Map<string, { cx: number; cy: number; heights: Int16Array; paint: Uint8Array | null }>();
  const workOn = (cx: number, cy: number) => {
    const key = keyOf(cx, cy);
    let chunk = changed.get(key);
    if (!chunk) {
      const kept = held.get(key);
      chunk = {
        cx,
        cy,
        heights: kept ? kept.heights.slice() : new Int16Array(GROUND_CHUNK_SAMPLE_COUNT),
        paint: kept?.paint ? kept.paint.slice() : null,
      };
      changed.set(key, chunk);
    }
    return chunk;
  };
  for (let j = Math.max(0, Math.ceil(middleJ - reach)); j <= Math.floor(middleJ + reach); j++) {
    for (let i = Math.max(0, Math.ceil(middleI - reach)); i <= Math.floor(middleI + reach); i++) {
      const weight = falloff(Math.hypot(i - middleI, j - middleJ), reach);
      if (weight <= 0) continue;
      const chunk = workOn(Math.floor(i / GROUND_CHUNK_SAMPLES), Math.floor(j / GROUND_CHUNK_SAMPLES));
      const at = (j % GROUND_CHUNK_SAMPLES) * GROUND_CHUNK_SAMPLES + (i % GROUND_CHUNK_SAMPLES);
      if (dab.kind === 'paint') {
        chunk.paint ??= new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * GROUND_PAINT_LAYERS.length);
        paintSample(chunk.paint, at, dab.layer ?? 'grass', Math.min(1, dab.strength * weight));
        continue;
      }
      const height = sampleAt(i, j);
      const share = Math.min(1, dab.strength * weight);
      const to =
        dab.kind === 'raise'
          ? height + (dab.strength * weight) / GROUND_HEIGHT_STEP
          : dab.kind === 'lower'
            ? height - (dab.strength * weight) / GROUND_HEIGHT_STEP
            : dab.kind === 'flatten'
              ? height + ((dab.level ?? 0) / GROUND_HEIGHT_STEP - height) * share
              : height + (neighbourhoodOf(sampleAt, i, j) - height) * share;
      chunk.heights[at] = Math.max(-HEIGHT_LIMIT - 1, Math.min(HEIGHT_LIMIT, Math.round(to)));
    }
  }
  return [...changed.values()];
}

/** The mean height of a sample and the eight round it, in steps. */
function neighbourhoodOf(sampleAt: (i: number, j: number) => number, i: number, j: number): number {
  let sum = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) sum += sampleAt(i + di, j + dj);
  }
  return sum / 9;
}

/**
 * Lays a share of a kind of ground on a sample: the kind is taken that share of the way to full and
 * every other the same share of the way to none.
 */
function paintSample(paint: Uint8Array, sample: number, layer: GroundPaintLayer, share: number): void {
  const base = sample * GROUND_PAINT_LAYERS.length;
  GROUND_PAINT_LAYERS.forEach((kind, index) => {
    const now = paint[base + index];
    const to = kind === layer ? GROUND_PAINT_FULL : 0;
    paint[base + index] = Math.round(now + (to - now) * share);
  });
}
