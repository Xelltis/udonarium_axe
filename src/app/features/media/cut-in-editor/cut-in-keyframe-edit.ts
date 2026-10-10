import { type CutInEasingName } from '@axe/domain/media/cubic-bezier';
import {
  CUT_IN_TRACKS,
  type CutInKey,
  type CutInTrackName,
  type CutInTrackSet,
  encodeCutInTracks,
  keyIndexAt,
  keyTimes,
  moveKey,
  removeKeyAt,
  sampleTrack,
  upsertKey,
} from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';

/**
 * Putting keys down and taking them up.
 *
 * Every property a key can hold also rests somewhere on the layer itself. Where a key
 * stands at the playhead the key is what is written; where none does, the resting value
 * is. That is what lets the same field in the properties panel serve both.
 */

/** Where each track's resting value lives on the layer. */
const RESTING: Record<CutInTrackName, keyof CutInLayer> = {
  x: 'x',
  y: 'y',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  rotation: 'rotation',
  opacity: 'opacity',
  blur: 'blur',
  wipe: 'wipe',
  crumble: 'crumble',
};

/** The value a track holds on the layer itself when no key applies, taken as 0 when it is not a number. */
export function restingValue(layer: CutInLayer, track: CutInTrackName): number {
  const value = Number(layer[RESTING[track]]);
  return Number.isFinite(value) ? value : 0;
}

function setResting(layer: CutInLayer, track: CutInTrackName, value: number): void {
  (layer as unknown as Record<string, number>)[RESTING[track] as string] = value;
}

function writeTracks(layer: CutInLayer, tracks: CutInTrackSet): void {
  layer.tracks = encodeCutInTracks(tracks);
}

/** A copy of a track's keys, safe to change without touching the layer; empty when the track has none. */
export function keysOf(layer: CutInLayer, track: CutInTrackName): CutInKey[] {
  return [...(layer.trackSet[track] ?? [])];
}

/** What the layer shows for a track at a moment, whether from a key or from where it rests. */
export function valueAt(layer: CutInLayer, track: CutInTrackName, ms: number): number {
  return sampleTrack(layer.trackSet[track], ms, restingValue(layer, track));
}

/** Whether a track has a key standing at a moment. */
export function hasKeyAt(layer: CutInLayer, track: CutInTrackName, ms: number): boolean {
  return keyIndexAt(layer.trackSet[track], ms) >= 0;
}

/** Every moment this layer has a key at, on any track. */
export function layerKeyTimes(layer: CutInLayer): number[] {
  return keyTimes(layer.trackSet);
}

/**
 * Writes a value at a moment.
 *
 * A key already standing there takes it. Otherwise, a track that is already moving takes
 * a new key so the change is not lost the moment the playhead moves, and a track that is
 * not moving simply rests somewhere new.
 */
export function setValueAt(layer: CutInLayer, track: CutInTrackName, ms: number, value: number): void {
  const keys = layer.trackSet[track];
  if (!keys || keys.length < 1) {
    setResting(layer, track, value);
    return;
  }

  writeTracks(layer, { ...layer.trackSet, [track]: upsertKey(keys, { t: ms, v: value }) });
}

/** Puts a key down at the moment, or takes away the one already there. */
export function toggleKeyAt(layer: CutInLayer, track: CutInTrackName, ms: number): boolean {
  const keys = layer.trackSet[track];

  if (keyIndexAt(keys, ms) >= 0) {
    const left = removeKeyAt(keys, ms);
    const tracks = { ...layer.trackSet };
    if (left.length > 0) tracks[track] = left;
    else delete tracks[track];
    writeTracks(layer, tracks);
    return false;
  }

  const value = valueAt(layer, track, ms);
  writeTracks(layer, { ...layer.trackSet, [track]: upsertKey(keys, { t: ms, v: value }) });
  return true;
}

/** Slides every key standing at one moment along to another. */
export function moveLayerKeys(layer: CutInLayer, fromMs: number, toMs: number): boolean {
  const tracks = { ...layer.trackSet };
  let moved = false;

  for (const track of CUT_IN_TRACKS) {
    const keys = tracks[track];
    if (!keys || keyIndexAt(keys, fromMs) < 0) continue;
    tracks[track] = moveKey(keys, fromMs, toMs);
    moved = true;
  }

  if (moved) writeTracks(layer, tracks);
  return moved;
}

/** Takes away every key standing at a moment. */
export function removeLayerKeys(layer: CutInLayer, ms: number): boolean {
  const tracks = { ...layer.trackSet };
  let removed = false;

  for (const track of CUT_IN_TRACKS) {
    const keys = tracks[track];
    if (!keys || keyIndexAt(keys, ms) < 0) continue;

    const left = removeKeyAt(keys, ms);
    if (left.length > 0) tracks[track] = left;
    else delete tracks[track];
    removed = true;
  }

  if (removed) writeTracks(layer, tracks);
  return removed;
}

/** The curve out of a moment, where every key standing there agrees on one. */
export function easingAtMoment(layer: CutInLayer, ms: number): CutInEasingName | null {
  let agreed: CutInEasingName | null = null;

  for (const track of CUT_IN_TRACKS) {
    const keys = layer.trackSet[track];
    const at = keyIndexAt(keys, ms);
    if (!keys || at < 0) continue;

    const curve = keys[at].e ?? 'outCubic';
    if (agreed !== null && agreed !== curve) return null;
    agreed = curve;
  }
  return agreed;
}

/** Gives every key standing at a moment the same curve out of it. */
export function setEasingAtMoment(layer: CutInLayer, ms: number, easing: CutInEasingName): boolean {
  const tracks = { ...layer.trackSet };
  let written = false;

  for (const track of CUT_IN_TRACKS) {
    const keys = tracks[track];
    const at = keyIndexAt(keys, ms);
    if (!keys || at < 0) continue;

    tracks[track] = upsertKey(keys, { ...keys[at], e: easing });
    written = true;
  }

  if (written) writeTracks(layer, tracks);
  return written;
}

/**
 * Every value a layer holds at one moment, and putting that back at another.
 *
 * A pose worked out once — where a layer sits, how far round, how faint — is often wanted
 * again later in the scene, or on a layer beside it. Copying the moment rather than each
 * of nine fields is what every editor offers.
 */
export interface CutInPose {
  readonly values: Readonly<Record<CutInTrackName, number>>;
  /** The tracks the layer it was taken from actually moves on. */
  readonly moving: readonly CutInTrackName[];
}

/** Takes the layer's pose at a moment: every track's value there, and which tracks have keys. */
export function poseAt(layer: CutInLayer, ms: number): CutInPose {
  const values = {} as Record<CutInTrackName, number>;
  const moving: CutInTrackName[] = [];
  for (const track of CUT_IN_TRACKS) {
    values[track] = valueAt(layer, track, ms);
    if ((layer.trackSet[track]?.length ?? 0) > 0) moving.push(track);
  }
  return { values, moving };
}

/**
 * Lays a pose down as keys at a moment.
 *
 * Only what the layer it came from was moving is written, so pasting a pose does not pin
 * down nine properties that were never animated. A pose off a layer that moves at nothing
 * has nothing to lay down.
 */
export function pastePoseAt(layer: CutInLayer, pose: CutInPose, ms: number): boolean {
  if (pose.moving.length < 1) return false;

  const tracks = { ...layer.trackSet };
  for (const track of pose.moving) {
    const value = pose.values[track];
    if (!Number.isFinite(value)) continue;
    tracks[track] = upsertKey(tracks[track], { t: ms, v: value });
  }
  writeTracks(layer, tracks);
  return true;
}
