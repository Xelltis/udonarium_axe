import { ObjectStore } from '@axe/core/sync/object-store';
import { autoLevelGain, type LevelKind } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { DEFAULT_DJ_SETTINGS, type DjSettings } from '@axe/domain/media/dj-settings';
import type { Config } from '@axe/domain/peer/config';

/** How the room mixes its music, or the defaults before the room's settings exist. */
export function roomMix(): DjSettings {
  return ObjectStore.instance.get<Config>('Config')?.djSettings ?? DEFAULT_DJ_SETTINGS;
}

/**
 * The factor a sound is played at to bring it to the loudness of its kind, while the room levels
 * its sounds; 1 while it does not, or before the sound has been read.
 */
export function mixLevelOf(identifier: string, kind: LevelKind): number {
  return roomMix().autoLevel ? autoLevelGain(AudioProfile.analysisOf(identifier), kind) : 1;
}
