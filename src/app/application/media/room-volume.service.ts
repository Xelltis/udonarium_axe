import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { DEFAULT_ROOM_VOLUMES, MAX_ROOM_VOLUME, RoomVolumeKind, RoomVolumes } from '@axe/domain/media/room-volumes';
import { Config } from '@axe/domain/peer/config';

/**
 * The room's volumes, which every listener's own volumes are multiplied by: an overall one, and one
 * for each kind of sound on top of it. They are shared with the room, and only the game master may
 * change them, as with the room's other shared settings.
 */
@Injectable({ providedIn: 'root' })
export class RoomVolumeService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  /** The room's overall volume, from 0 to 2; 1 before the room's settings exist. */
  readonly volume = computed(() => {
    this.objectChange.versionOf('Config')();
    return this.objectStore.get<Config>('Config')?.roomVolume ?? 1;
  });

  /** The room's volume for each kind of sound, from 0 to 2; 1 for each before the room's settings exist. */
  readonly volumes = computed<RoomVolumes>(() => {
    this.objectChange.versionOf('Config')();
    return this.objectStore.get<Config>('Config')?.roomVolumes ?? DEFAULT_ROOM_VOLUMES;
  });

  /** Whether this reader may change the room's volumes, which only the game master may. */
  readonly canChange = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditShared;
  });

  /** Sets the room's overall volume for everyone and makes it heard here at once. Anyone but the game master is refused. */
  set(volume: number): void {
    if (!this.rolePermission.canEditShared) return;
    const config = this.objectStore.get<Config>('Config');
    if (config) config.roomVolume = volume;
    this.objectStore.get<Jukebox>('Jukebox')?.setNewVolume();
  }

  /**
   * Sets the room's volume for one kind of sound for everyone and makes it heard here at once.
   * Anyone but the game master is refused.
   */
  setKind(kind: RoomVolumeKind, volume: number): void {
    if (!this.rolePermission.canEditShared) return;
    const config = this.objectStore.get<Config>('Config');
    if (config) config.setRoomVolumeOf(kind, Math.min(MAX_ROOM_VOLUME, Math.max(0, volume)));
    this.objectStore.get<Jukebox>('Jukebox')?.setNewVolume();
  }
}
