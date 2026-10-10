import { type CutInEasingName, DEFAULT_CUT_IN_EASING, easingAt, readCutInEasing } from '@axe/domain/media/cubic-bezier';

/**
 * What a cut-in layer does over time, held as one JSON string on the layer.
 *
 * Keys are not objects of their own. A scene of twenty layers with thirty keys apiece
 * would put six hundred more objects into the catalogue every peer is sent on joining,
 * for values nothing ever looks up on its own. EffectPreset holds its stage list the
 * same way, and this follows it.
 *
 * Field names are one letter because the string lands in an XML attribute, where every
 * quote is written out as six characters.
 */

export const CUT_IN_TRACKS = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'blur', 'wipe', 'crumble'] as const;
export type CutInTrackName = (typeof CUT_IN_TRACKS)[number];

/** How many keys one track may carry, and how far apart two count as the same moment. */
export const MAX_KEYS_PER_TRACK = 64;
export const KEY_TOLERANCE_MS = 8;

export interface CutInKey {
  /** When, in ms from the start of the scene. */
  t: number;
  v: number;
  /** The curve out of this key into the next. The last key's is never used. */
  e?: CutInEasingName;
}

export type CutInTrackSet = Partial<Record<CutInTrackName, CutInKey[]>>;

/** Whether a value names one of the properties a layer can animate. */
export function isCutInTrack(value: unknown): value is CutInTrackName {
  return typeof value === 'string' && (CUT_IN_TRACKS as readonly string[]).includes(value);
}

/**
 * Reads a layer's tracks back from the JSON string it stores.
 *
 * Unknown tracks and keys without a numeric time and value are dropped, keys come back sorted
 * by time and capped at 64 per track, and anything unreadable comes back as no tracks.
 */
export function parseCutInTracks(raw: string | null | undefined): CutInTrackSet {
  if (!raw || raw.trim().length < 1) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const tracks: CutInTrackSet = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isCutInTrack(name) || !Array.isArray(value)) continue;
      const keys = sortKeys(value.map(readKey).filter((key): key is CutInKey => key !== null));
      if (keys.length > 0) tracks[name] = keys.slice(0, MAX_KEYS_PER_TRACK);
    }
    return tracks;
  } catch {
    return {};
  }
}

/**
 * Writes a layer's tracks into the JSON string it stores.
 *
 * Empty tracks are left out, keys are sorted and capped at 64 per track, and a layer with no
 * keys at all writes as an empty string.
 */
export function encodeCutInTracks(tracks: CutInTrackSet): string {
  const written: CutInTrackSet = {};
  for (const name of CUT_IN_TRACKS) {
    const keys = tracks[name];
    if (keys && keys.length > 0) written[name] = sortKeys(keys).slice(0, MAX_KEYS_PER_TRACK);
  }
  if (Object.keys(written).length < 1) return '';

  try {
    return JSON.stringify(written);
  } catch {
    return '';
  }
}

/** The keys either side of a moment. Either is null where the moment falls outside them. */
export function surroundingKeys(
  keys: readonly CutInKey[] | undefined,
  ms: number
): { prev: CutInKey | null; next: CutInKey | null } {
  if (!keys || keys.length < 1) return { prev: null, next: null };

  let prev: CutInKey | null = null;
  let next: CutInKey | null = null;
  for (const key of keys) {
    if (key.t <= ms) prev = key;
    else {
      next = key;
      break;
    }
  }
  return { prev, next };
}

/** What a track says at a moment, holding its ends and easing in between. */
export function sampleTrack(keys: readonly CutInKey[] | undefined, ms: number, fallback: number): number {
  if (!keys || keys.length < 1) return fallback;

  const { prev, next } = surroundingKeys(keys, ms);
  if (!prev) return next ? next.v : fallback;
  if (!next) return prev.v;
  if (next.t <= prev.t) return next.v;

  const progress = (ms - prev.t) / (next.t - prev.t);
  return prev.v + (next.v - prev.v) * easingAt(prev.e ?? DEFAULT_CUT_IN_EASING, progress);
}

/** Whether a key sits at that moment, and which one it is. */
export function keyIndexAt(keys: readonly CutInKey[] | undefined, ms: number, toleranceMs = KEY_TOLERANCE_MS): number {
  if (!keys) return -1;
  return keys.findIndex((key) => Math.abs(key.t - ms) <= toleranceMs);
}

/** Puts a key down, replacing whatever already stood at that moment. */
export function upsertKey(
  keys: readonly CutInKey[] | undefined,
  key: CutInKey,
  toleranceMs = KEY_TOLERANCE_MS
): CutInKey[] {
  const written: CutInKey = { t: Math.max(0, Math.round(key.t)), v: key.v };
  if (key.e && key.e !== DEFAULT_CUT_IN_EASING) written.e = key.e;

  const rest = (keys ?? []).filter((existing) => Math.abs(existing.t - written.t) > toleranceMs);
  return sortKeys([...rest, written]).slice(0, MAX_KEYS_PER_TRACK);
}

/** Takes the key at that moment away, leaving the track as it was if none stood there. */
export function removeKeyAt(
  keys: readonly CutInKey[] | undefined,
  ms: number,
  toleranceMs = KEY_TOLERANCE_MS
): CutInKey[] {
  return (keys ?? []).filter((key) => Math.abs(key.t - ms) > toleranceMs);
}

/** Slides a key along the clock, replacing anything it lands on. */
export function moveKey(
  keys: readonly CutInKey[] | undefined,
  fromMs: number,
  toMs: number,
  toleranceMs = KEY_TOLERANCE_MS
): CutInKey[] {
  const at = keyIndexAt(keys, fromMs, toleranceMs);
  if (at < 0 || !keys) return [...(keys ?? [])];

  const moved = { ...keys[at], t: Math.max(0, Math.round(toMs)) };
  return upsertKey(removeKeyAt(keys, fromMs, toleranceMs), moved, toleranceMs);
}

/** Every moment any track has a key at, in order and without repeats. */
export function keyTimes(tracks: CutInTrackSet): number[] {
  const moments = new Set<number>();
  for (const name of CUT_IN_TRACKS) {
    for (const key of tracks[name] ?? []) moments.add(key.t);
  }
  return [...moments].sort((left, right) => left - right);
}

/** The last moment any track has a key at. */
export function lastKeyTime(tracks: CutInTrackSet): number {
  const moments = keyTimes(tracks);
  return moments.length > 0 ? moments[moments.length - 1] : 0;
}

function readKey(entry: unknown): CutInKey | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const source = entry as Record<string, unknown>;

  const t = Number(source['t']);
  const v = Number(source['v']);
  if (!Number.isFinite(t) || !Number.isFinite(v)) return null;

  const key: CutInKey = { t: Math.max(0, Math.round(t)), v };
  if (source['e'] !== undefined) {
    const easing = readCutInEasing(source['e']);
    if (easing !== DEFAULT_CUT_IN_EASING) key.e = easing;
  }
  return key;
}

function sortKeys(keys: readonly CutInKey[]): CutInKey[] {
  return [...keys].sort((left, right) => left.t - right.t);
}
