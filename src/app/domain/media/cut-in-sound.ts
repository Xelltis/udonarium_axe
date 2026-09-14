/**
 * The sounds a scene drops along its own clock.
 *
 * They are held as JSON on the scene for the same reason a layer holds its keys that
 * way: a sound is a value read while the scene plays, never an object anything looks up
 * on its own, and the catalogue every peer is sent on joining is not the place for it.
 */

export interface CutInSound {
  /** When, in ms from the start of the scene. */
  t: number;
  /** Which sound, by the identifier the audio storage knows it by. */
  a: string;
  /** How loud, from 0 to 100. */
  v: number;
}

export const MAX_SOUNDS = 32;
export const SOUND_TOLERANCE_MS = 8;
export const DEFAULT_SOUND_VOLUME = 100;

/**
 * Reads a scene's sounds back from the JSON string it stores.
 *
 * Entries without a time or a sound are dropped, a missing volume reads as full, and the rest
 * come back sorted by time and capped at 32. Anything unreadable comes back as no sounds.
 */
export function parseCutInSounds(raw: string | null | undefined): CutInSound[] {
  if (!raw || raw.trim().length < 1) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortSounds(parsed.map(readSound).filter((sound): sound is CutInSound => sound !== null)).slice(
      0,
      MAX_SOUNDS
    );
  } catch {
    return [];
  }
}

/** Writes a scene's sounds into the JSON string it stores, sorted and capped at 32. No sounds writes as empty. */
export function encodeCutInSounds(sounds: readonly CutInSound[]): string {
  const written = sortSounds(sounds).slice(0, MAX_SOUNDS);
  if (written.length < 1) return '';

  try {
    return JSON.stringify(written);
  } catch {
    return '';
  }
}

/** Whether a sound sits at that moment, and which one it is. */
export function soundIndexAt(sounds: readonly CutInSound[], ms: number, toleranceMs = SOUND_TOLERANCE_MS): number {
  return sounds.findIndex((sound) => Math.abs(sound.t - ms) <= toleranceMs);
}

/** Puts a sound down, replacing whatever already stood at that moment. */
export function upsertSound(
  sounds: readonly CutInSound[],
  sound: CutInSound,
  toleranceMs = SOUND_TOLERANCE_MS
): CutInSound[] {
  const written: CutInSound = {
    t: Math.max(0, Math.round(sound.t)),
    a: sound.a,
    v: Math.min(100, Math.max(0, Math.round(sound.v))),
  };
  const rest = sounds.filter((existing) => Math.abs(existing.t - written.t) > toleranceMs);
  return sortSounds([...rest, written]).slice(0, MAX_SOUNDS);
}

/** Takes away any sound at that moment, leaving the list as it was if none stood there. */
export function removeSoundAt(
  sounds: readonly CutInSound[],
  ms: number,
  toleranceMs = SOUND_TOLERANCE_MS
): CutInSound[] {
  return sounds.filter((sound) => Math.abs(sound.t - ms) > toleranceMs);
}

/** Slides a sound along the clock, replacing anything it lands on. */
export function moveSound(
  sounds: readonly CutInSound[],
  fromMs: number,
  toMs: number,
  toleranceMs = SOUND_TOLERANCE_MS
): CutInSound[] {
  const at = soundIndexAt(sounds, fromMs, toleranceMs);
  if (at < 0) return [...sounds];

  const moved = { ...sounds[at], t: Math.max(0, Math.round(toMs)) };
  return upsertSound(removeSoundAt(sounds, fromMs, toleranceMs), moved, toleranceMs);
}

/** The sounds falling after one moment and up to another, in the order they play. */
export function soundsBetween(sounds: readonly CutInSound[], afterMs: number, toMs: number): CutInSound[] {
  return sounds.filter((sound) => sound.t > afterMs && sound.t <= toMs);
}

function readSound(entry: unknown): CutInSound | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const source = entry as Record<string, unknown>;

  const t = Number(source['t']);
  const a = source['a'];
  if (!Number.isFinite(t) || typeof a !== 'string' || a.length < 1) return null;

  const v = Number(source['v']);
  return {
    t: Math.max(0, Math.round(t)),
    a,
    v: Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : DEFAULT_SOUND_VOLUME,
  };
}

function sortSounds(sounds: readonly CutInSound[]): CutInSound[] {
  return [...sounds].sort((left, right) => left.t - right.t);
}
