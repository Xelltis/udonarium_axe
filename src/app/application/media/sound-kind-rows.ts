import { PERSONAL_VOLUME_KINDS, PersonalVolumeKind } from '@axe/application/media/personal-volumes';
import { ROOM_VOLUME_KINDS, RoomVolumeKind } from '@axe/domain/media/room-volumes';

/** One kind of sound as a volume list shows it: the slider's icon and the name of its input. */
export interface SoundKindRow<Kind extends string = PersonalVolumeKind> {
  readonly kind: Kind;
  readonly icon: string;
  readonly name: string;
}

const ICONS: Readonly<Record<PersonalVolumeKind, string>> = {
  audition: 'headphones',
  bgm: 'library_music',
  background: 'waves',
  cutIn: 'slideshow',
  notification: 'notifications',
  handling: 'pan_tool',
  effect: 'auto_awesome',
  se: 'star',
};

const NAMES: Readonly<Record<PersonalVolumeKind, string>> = {
  audition: 'audition-volume',
  bgm: 'bgm-volume',
  background: 'background-volume',
  cutIn: 'cut-in-volume',
  notification: 'notification-volume',
  handling: 'handling-volume',
  effect: 'effect-volume',
  se: 'se-volume',
};

/** The row of one of the listener's own volumes. */
export function soundKindRow(kind: PersonalVolumeKind): SoundKindRow {
  return { kind, icon: ICONS[kind], name: NAMES[kind] };
}

/** The row of one of the room's volumes, with the icon the kind has among the listener's own. */
export function roomSoundKindRow(kind: RoomVolumeKind): SoundKindRow<RoomVolumeKind> {
  return { kind, icon: ICONS[kind], name: `room-${NAMES[kind]}` };
}

/** Every kind the listener sets a volume for, in the order the settings list them. */
export const SOUND_KIND_ROWS: readonly SoundKindRow[] = PERSONAL_VOLUME_KINDS.map(soundKindRow);

/** Every kind the room sets a volume for, in the order the settings list them. */
export const ROOM_SOUND_KIND_ROWS: readonly SoundKindRow<RoomVolumeKind>[] = ROOM_VOLUME_KINDS.map(roomSoundKindRow);
