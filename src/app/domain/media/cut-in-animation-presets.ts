import type { CutInEasingName } from '@axe/domain/media/cubic-bezier';
import {
  type CutInKey,
  type CutInTrackName,
  type CutInTrackSet,
  encodeCutInTracks,
  upsertKey,
} from '@axe/domain/media/cut-in-keyframe';
import type { CutInLayer } from '@axe/domain/media/cut-in-layer';

/**
 * Ready-made ways for a layer to arrive and to leave.
 *
 * A preset does not become a property of the layer. It lays keys down and then gets out
 * of the way, so what it wrote can be dragged about, retimed or thrown away like any
 * other key. Where the layer ends up is left alone: a preset only says where it comes
 * from and where it goes.
 */

export const CUT_IN_ENTRANCES = [
  'fadeIn',
  'slideInLeft',
  'slideInRight',
  'slideInTop',
  'slideInBottom',
  'zoomIn',
  'popIn',
  'spinIn',
] as const;

export const CUT_IN_EXITS = [
  'fadeOut',
  'slideOutLeft',
  'slideOutRight',
  'slideOutTop',
  'slideOutBottom',
  'zoomOut',
  'dropOut',
] as const;

export type CutInEntrance = (typeof CUT_IN_ENTRANCES)[number];
export type CutInExit = (typeof CUT_IN_EXITS)[number];

export const DEFAULT_PRESET_MS = 400;

export interface PresetStage {
  width: number;
  height: number;
}

/** Where the layer is at rest, which is where an entrance lands and an exit leaves from. */
export interface PresetRest {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

/** Whether a value names one of the ready-made ways for a layer to arrive. */
export function isCutInEntrance(value: unknown): value is CutInEntrance {
  return typeof value === 'string' && (CUT_IN_ENTRANCES as readonly string[]).includes(value);
}

/** Whether a value names one of the ready-made ways for a layer to leave. */
export function isCutInExit(value: unknown): value is CutInExit {
  return typeof value === 'string' && (CUT_IN_EXITS as readonly string[]).includes(value);
}

/** The value each track leaves from, for an entrance, or arrives at, for an exit. */
function awayFrom(name: CutInEntrance | CutInExit, rest: PresetRest, stage: PresetStage): Partial<PresetRest> {
  switch (name) {
    case 'fadeIn':
    case 'fadeOut':
      return { opacity: 0 };
    case 'slideInLeft':
    case 'slideOutLeft':
      return { x: -rest.width, opacity: 0 };
    case 'slideInRight':
    case 'slideOutRight':
      return { x: Math.max(stage.width, rest.x + rest.width), opacity: 0 };
    case 'slideInTop':
    case 'slideOutTop':
      return { y: -rest.height, opacity: 0 };
    case 'slideInBottom':
    case 'slideOutBottom':
      return { y: Math.max(stage.height, rest.y + rest.height), opacity: 0 };
    case 'zoomIn':
    case 'zoomOut':
      return { scaleX: 0.2, scaleY: 0.2, opacity: 0 };
    case 'popIn':
      return { scaleX: 0.5, scaleY: 0.5, opacity: 0 };
    case 'spinIn':
      return { rotation: rest.rotation - 180, scaleX: 0.4, scaleY: 0.4, opacity: 0 };
    case 'dropOut':
      return { y: Math.max(stage.height, rest.y + rest.height), rotation: rest.rotation + 25, opacity: 0 };
    default:
      return { opacity: 0 };
  }
}

/** The curve a preset travels along. */
function curveOf(name: CutInEntrance | CutInExit): CutInEasingName {
  if (name === 'popIn') return 'outBack';
  if (name === 'dropOut') return 'inCubic';
  return name.startsWith('slideOut') || name.startsWith('zoomOut') || name === 'fadeOut' ? 'inCubic' : 'outCubic';
}

/** The tracks with an entrance written into them, from `atMs` over `durationMs`. */
export function withEntrance(
  tracks: CutInTrackSet,
  name: CutInEntrance,
  rest: PresetRest,
  stage: PresetStage,
  atMs: number,
  durationMs = DEFAULT_PRESET_MS
): CutInTrackSet {
  const away = awayFrom(name, rest, stage);
  const curve = curveOf(name);
  return write(tracks, away, rest, [
    { at: atMs, from: true, easing: curve },
    { at: atMs + Math.max(1, durationMs), from: false },
  ]);
}

/** The tracks with an exit written into them, ending at `atMs`. */
export function withExit(
  tracks: CutInTrackSet,
  name: CutInExit,
  rest: PresetRest,
  stage: PresetStage,
  atMs: number,
  durationMs = DEFAULT_PRESET_MS
): CutInTrackSet {
  const away = awayFrom(name, rest, stage);
  const curve = curveOf(name);
  const startMs = Math.max(0, atMs - Math.max(1, durationMs));
  return write(tracks, away, rest, [
    { at: startMs, from: false, easing: curve },
    { at: atMs, from: true },
  ]);
}

function write(
  tracks: CutInTrackSet,
  away: Partial<PresetRest>,
  rest: PresetRest,
  moments: { at: number; from: boolean; easing?: CutInEasingName }[]
): CutInTrackSet {
  const written: CutInTrackSet = { ...tracks };

  for (const track of Object.keys(away) as (keyof PresetRest)[]) {
    if (!isTrack(track)) continue;

    let keys = written[track] ?? [];
    for (const moment of moments) {
      const key: CutInKey = { t: moment.at, v: moment.from ? (away[track] as number) : rest[track] };
      if (moment.easing) key.e = moment.easing;
      keys = upsertKey(keys, key);
    }
    written[track] = keys;
  }
  return written;
}

/** Everything a preset moves is a track; width and height are only there to measure with. */
function isTrack(name: keyof PresetRest): name is keyof PresetRest & CutInTrackName {
  return name !== 'width' && name !== 'height';
}

/** Where a layer rests, read off the layer itself. */
export function restOf(layer: CutInLayer): PresetRest {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    opacity: layer.opacity,
  };
}

/** Lays an entrance onto a layer, keeping whatever else it was already doing. */
export function applyEntrance(
  layer: CutInLayer,
  name: CutInEntrance,
  stage: PresetStage,
  durationMs = DEFAULT_PRESET_MS
): void {
  layer.tracks = encodeCutInTracks(withEntrance(layer.trackSet, name, restOf(layer), stage, layer.startMs, durationMs));
}

/** Lays an exit onto a layer, ending where the layer leaves the screen. */
export function applyExit(
  layer: CutInLayer,
  name: CutInExit,
  stage: PresetStage,
  sceneDurationMs: number,
  durationMs = DEFAULT_PRESET_MS
): void {
  const endMs = layer.endMs > 0 ? layer.endMs : sceneDurationMs;
  layer.tracks = encodeCutInTracks(withExit(layer.trackSet, name, restOf(layer), stage, endMs, durationMs));
}
