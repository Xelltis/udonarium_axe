/** Where this browser keeps the listener's own volumes. */
export const PERSONAL_VOLUME_STORAGE_KEY = 'audio-personal-volumes';

/** The listener's own volumes, each from 0 to 1, before the room volume scales them. */
export interface PersonalVolumes {
  readonly audition: number;
  readonly bgm: number;
  readonly se: number;
  readonly background: number;
  readonly cutIn: number;
  readonly notification: number;
  readonly handling: number;
  readonly effect: number;
}

export type PersonalVolumeKind = keyof PersonalVolumes;

/** Every kind of sound the listener sets a volume for, in the order the settings list them. */
export const PERSONAL_VOLUME_KINDS: readonly PersonalVolumeKind[] = [
  'audition',
  'bgm',
  'background',
  'cutIn',
  'notification',
  'handling',
  'effect',
  'se',
];

export const DEFAULT_PERSONAL_VOLUMES: PersonalVolumes = {
  audition: 0.5,
  bgm: 0.5,
  se: 0.5,
  background: 0.5,
  cutIn: 0.5,
  notification: 0.5,
  handling: 0.5,
  effect: 0.5,
};

/** The listener's own sound settings: a volume for each kind, and the kinds turned off. */
export interface PersonalSound {
  readonly volumes: PersonalVolumes;
  readonly muted: readonly PersonalVolumeKind[];
}

export const DEFAULT_PERSONAL_SOUND: PersonalSound = { volumes: DEFAULT_PERSONAL_VOLUMES, muted: [] };

function isPersonalVolumeKind(value: unknown): value is PersonalVolumeKind {
  return typeof value === 'string' && (PERSONAL_VOLUME_KINDS as readonly string[]).includes(value);
}

/**
 * Reads the listener's volumes from storage text, taking the default for any one missing, not a
 * number or outside 0 to 1, and for text that cannot be read.
 */
export function parsePersonalVolumes(raw: string | null): PersonalVolumes {
  return parsePersonalSound(raw).volumes;
}

/**
 * Reads the listener's sound settings from storage text.
 *
 * A volume missing, not a number or outside 0 to 1 takes the default, so what a version that knew
 * fewer kinds wrote down still reads. Of the kinds turned off, only names it knows are kept, each
 * once; anything but a list turns nothing off.
 */
export function parsePersonalSound(raw: string | null): PersonalSound {
  if (!raw) return DEFAULT_PERSONAL_SOUND;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<PersonalVolumeKind | 'muted', unknown>> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PERSONAL_SOUND;
    const volumes = {} as Record<PersonalVolumeKind, number>;
    for (const kind of PERSONAL_VOLUME_KINDS) {
      const value = parsed[kind];
      volumes[kind] = typeof value === 'number' && value >= 0 && value <= 1 ? value : DEFAULT_PERSONAL_VOLUMES[kind];
    }
    const muted = Array.isArray(parsed.muted) ? [...new Set(parsed.muted.filter(isPersonalVolumeKind))] : [];
    return { volumes, muted };
  } catch {
    return DEFAULT_PERSONAL_SOUND;
  }
}

/** Writes the listener's sound settings down as storage text, which `parsePersonalSound` reads back. */
export function formatPersonalSound(sound: PersonalSound): string {
  return JSON.stringify({ ...sound.volumes, muted: [...sound.muted] });
}
