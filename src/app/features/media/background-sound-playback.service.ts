import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BackgroundSound } from '@axe/domain/media/background-sound';

/** A background sound as the jukebox's controls show it. */
export interface BackgroundSoundView {
  audioIdentifier: string;
  /** The sound's name, or empty while its file has not reached this peer. */
  name: string;
  /** The room's volume for it, from 0 to 1. */
  level: number;
}

/**
 * The room's background sounds as the jukebox panel and the mini player both work them: which are
 * playing, and starting, stopping and setting the room's volume for each.
 *
 * A guest, who is there to watch, starts, stops and sets none of them.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundSoundPlaybackService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly rolePermission = inject(RolePermissionService);

  /** Whether this reader may change the room's background sounds, which every role but a guest may. */
  readonly canOperate = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /** The background sounds playing in the room, in the order they were started. */
  readonly playing = computed<BackgroundSoundView[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(BackgroundSound.aliasName)();
    for (const sound of this.objectStore.getObjects(BackgroundSound)) this.objectChange.versionOf(sound.identifier)();
    return BackgroundSound.playing().map((sound) => ({
      audioIdentifier: sound.audioIdentifier,
      name: this.audioStorage.get(sound.audioIdentifier)?.name ?? '',
      level: sound.level,
    }));
  });

  private readonly playingIdentifiers = computed(() => new Set(this.playing().map((sound) => sound.audioIdentifier)));

  /** Whether a sound is playing as one of the room's background sounds. */
  isPlaying(audio: AudioFile): boolean {
    return this.playingIdentifiers().has(audio.identifier);
  }

  /** Starts a sound looping for the whole room, or stops it when it is playing already. */
  toggle(audio: AudioFile): void {
    if (!this.rolePermission.canEditTabletop) return;
    if (this.isPlaying(audio)) this.stop(audio.identifier);
    else BackgroundSound.start(audio.identifier);
  }

  /** Stops one background sound for the whole room. */
  stop(audioIdentifier: string): void {
    if (!this.rolePermission.canEditTabletop) return;
    BackgroundSound.of(audioIdentifier)?.stop();
  }

  /** Stops every background sound for the whole room. */
  stopAll(): void {
    if (!this.rolePermission.canEditTabletop) return;
    BackgroundSound.stopAll();
  }

  /** Lets this peer hear a volume while its slider is being dragged, without sharing it yet. */
  previewVolume(audioIdentifier: string, volume: number): void {
    if (!this.rolePermission.canEditTabletop) return;
    BackgroundSound.of(audioIdentifier)?.previewVolume(volume);
  }

  /** Sets the room's volume for a background sound, for everyone. */
  commitVolume(audioIdentifier: string, volume: number): void {
    if (!this.rolePermission.canEditTabletop) return;
    BackgroundSound.of(audioIdentifier)?.setVolume(volume);
  }
}
