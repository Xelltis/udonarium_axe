import { VolumeType } from '@axe/core/storage/audio-player';

/**
 * The kinds of sound the room sets a volume of its own for, on top of its overall volume.
 *
 * Previews are left out: only the listener hears them, so the room has no say in how loud they are
 * beyond its overall volume.
 */
export type RoomVolumeKind = 'bgm' | 'background' | 'cutIn' | 'notification' | 'handling' | 'effect' | 'se';

/** Every kind the room sets a volume for, in the order the settings list them. */
export const ROOM_VOLUME_KINDS: readonly RoomVolumeKind[] = [
  'bgm',
  'background',
  'cutIn',
  'notification',
  'handling',
  'effect',
  'se',
];

/** The room's volume for each kind of sound, each from 0 to `MAX_ROOM_VOLUME`. */
export type RoomVolumes = Readonly<Record<RoomVolumeKind, number>>;

/** How far the room may turn a volume up, as with its overall volume. */
export const MAX_ROOM_VOLUME = 2;

export const DEFAULT_ROOM_VOLUMES: RoomVolumes = {
  bgm: 1,
  background: 1,
  cutIn: 1,
  notification: 1,
  handling: 1,
  effect: 1,
  se: 1,
};

const KIND_OF_CHANNEL: Partial<Record<VolumeType, RoomVolumeKind>> = {
  [VolumeType.MASTER]: 'bgm',
  [VolumeType.BACKGROUND]: 'background',
  [VolumeType.CUT_IN]: 'cutIn',
  [VolumeType.NOTIFICATION]: 'notification',
  [VolumeType.HANDLING]: 'handling',
  [VolumeType.EFFECT]: 'effect',
  [VolumeType.SE]: 'se',
};

/** The kind of sound a channel plays, as the room sets its volume, or null for the preview channel. */
export function roomVolumeKindOf(type: VolumeType): RoomVolumeKind | null {
  return KIND_OF_CHANNEL[type] ?? null;
}

/**
 * Reads the room's volumes as they were sent or saved.
 *
 * A kind missing, not a number or out of range takes full volume, as does text that cannot be read,
 * so a room from a version that knew no such volumes sounds as it did. A volume of 0 is kept: the
 * room turned that kind off.
 */
export function readRoomVolumes(raw: unknown): RoomVolumes {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_ROOM_VOLUMES;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<RoomVolumeKind, unknown>> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_ROOM_VOLUMES;
    const volumes = {} as Record<RoomVolumeKind, number>;
    for (const kind of ROOM_VOLUME_KINDS) {
      const value = parsed[kind];
      volumes[kind] =
        typeof value === 'number' && value >= 0 && value <= MAX_ROOM_VOLUME ? value : DEFAULT_ROOM_VOLUMES[kind];
    }
    return volumes;
  } catch {
    return DEFAULT_ROOM_VOLUMES;
  }
}

/**
 * Writes the room's volumes down as the text `readRoomVolumes` reads back, naming only the kinds
 * turned away from full volume. Empty when none is.
 */
export function writeRoomVolumes(volumes: RoomVolumes): string {
  const changed = ROOM_VOLUME_KINDS.filter((kind) => volumes[kind] !== DEFAULT_ROOM_VOLUMES[kind]);
  if (changed.length === 0) return '';
  return JSON.stringify(Object.fromEntries(changed.map((kind) => [kind, volumes[kind]])));
}
