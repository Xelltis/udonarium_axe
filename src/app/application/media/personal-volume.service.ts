import { inject, Injectable, signal } from '@angular/core';
import {
  DEFAULT_PERSONAL_SOUND,
  formatPersonalSound,
  parsePersonalSound,
  PERSONAL_VOLUME_KINDS,
  PERSONAL_VOLUME_STORAGE_KEY,
  PersonalSound,
  PersonalVolumeKind,
} from '@axe/application/media/personal-volumes';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
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

  /** Hands the remembered volumes to the room's jukebox and the players, as the app starts. */
  restore(): void {
    this.apply();
  }

  private save(next: PersonalSound): void {
    this.sound.set(next);
    this.apply();
    try {
      localStorage.setItem(PERSONAL_VOLUME_STORAGE_KEY, formatPersonalSound(next));
    } catch {
      // Private browsing refuses the write; the volume still holds for this session.
    }
  }

  /**
   * Puts each kind's level on its channel, scaled by the room's master volume and its volume for
   * that kind. The jukebox is handed the levels as well, since it puts them back on the channels
   * whenever the room volume changes.
   */
  private apply(): void {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    const config = this.objectStore.get<Config>('Config');
    for (const kind of PERSONAL_VOLUME_KINDS) {
      const channel = PERSONAL_VOLUME_CHANNELS[kind];
      const level = this.levelOf(kind);
      jukebox?.setLevel(channel, level);
      AudioPlayer.setChannelVolume(channel, level * (config?.roomScaleFor(channel) ?? 1));
    }
  }
}

function storedSound(): PersonalSound {
  try {
    return parsePersonalSound(localStorage.getItem(PERSONAL_VOLUME_STORAGE_KEY));
  } catch {
    return DEFAULT_PERSONAL_SOUND;
  }
}
