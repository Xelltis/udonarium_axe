import { inject, Injectable, signal } from '@angular/core';
import {
  formatPersonalSound,
  parsePersonalSound,
  PERSONAL_VOLUME_KINDS,
  PersonalSound,
  PersonalVolumeKind,
} from '@axe/application/media/personal-volumes';
import { AudioOutput, VolumeType } from '@axe/core/storage/audio-output';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';

/** The channel each kind of sound plays through. */
export const PERSONAL_VOLUME_CHANNELS: Readonly<Record<PersonalVolumeKind, VolumeType>> = {
  audition: VolumeType.AUDITION,
  bgm: VolumeType.MASTER,
  se: VolumeType.SE,
  background: VolumeType.BACKGROUND,
  cutIn: VolumeType.CUT_IN,
  notification: VolumeType.NOTIFICATION,
  handling: VolumeType.HANDLING,
  effect: VolumeType.EFFECT,
};

/**
 * The listener's own volume for each kind of sound, and which kinds they have turned off, kept in
 * this browser so they hold from one session and one room to the next.
 *
 * They are this listener's alone and never reach the room. What is heard is each scaled by the
 * room volume, which the room shares. A kind turned off keeps its volume, to come back at when it
 * is turned on again.
 */
@Injectable({ providedIn: 'root' })
export class PersonalVolumeService {
  private readonly objectStore = inject(ObjectStore);
  private readonly sound = signal<PersonalSound>(storedSound());

  /** One of the listener's own volumes, from 0 to 1, whether or not that kind is turned off. */
  get(kind: PersonalVolumeKind): number {
    return this.sound().volumes[kind];
  }

  /** Whether the listener has turned a kind of sound off. */
  isMuted(kind: PersonalVolumeKind): boolean {
    return this.sound().muted.includes(kind);
  }

  /** How loud a kind of sound is for the listener, from 0 to 1: its volume, or nothing while it is turned off. */
  levelOf(kind: PersonalVolumeKind): number {
    return this.isMuted(kind) ? 0 : this.get(kind);
  }

  /** Sets one of the listener's own volumes, makes it heard at once and remembers it in this browser. */
  set(kind: PersonalVolumeKind, volume: number): void {
    const current = this.sound();
    this.save({ ...current, volumes: { ...current.volumes, [kind]: Math.min(1, Math.max(0, volume)) } });
  }

  /** Turns a kind of sound off or back on for the listener, and remembers it in this browser. */
  setMuted(kind: PersonalVolumeKind, muted: boolean): void {
    const rest = this.sound().muted.filter((held) => held !== kind);
    this.save({ ...this.sound(), muted: muted ? [...rest, kind] : rest });
  }

  /**
   * Puts the listener's volumes on the players, each scaled by the room's volume for its kind: as
   * the app starts, and whenever the room's volumes change.
   */
  applyToChannels(): void {
    const config = this.objectStore.get<Config>('Config');
    for (const kind of PERSONAL_VOLUME_KINDS) {
      const channel = PERSONAL_VOLUME_CHANNELS[kind];
      AudioOutput.setChannelVolume(channel, this.levelOf(kind) * (config?.roomScaleFor(channel) ?? 1));
    }
  }

  private save(next: PersonalSound): void {
    this.sound.set(next);
    this.applyToChannels();
    writeLocal(STORAGE_KEYS.personalVolumes, formatPersonalSound(next));
  }
}

function storedSound(): PersonalSound {
  return parsePersonalSound(readLocal(STORAGE_KEYS.personalVolumes));
}
