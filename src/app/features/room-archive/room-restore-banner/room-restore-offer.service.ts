import { computed, inject, Injectable, signal } from '@angular/core';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { Network } from '@axe/core/network/network';
import { parseInviteLink } from '@axe/domain/peer/invite-link';

/**
 * The offer to restore the last table kept in this browser, made outside any room to whoever may
 * change the table, until it is answered. A notice at the top of a narrow screen waits on it, as
 * the offer takes the top of the screen there.
 */
@Injectable({ providedIn: 'root' })
export class RoomRestoreOfferService {
  private readonly roomSnapshot = inject(RoomSnapshotService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly localModePreference = inject(LocalModePreferenceService);

  private readonly dismissed = signal(false);

  /** The last table kept, which is the one offered, or null when none is. */
  readonly latest = computed(() => this.roomSnapshot.snapshots()[0] ?? null);

  /**
   * Whether the offer is up: there is a table to restore, the seat is in no room and is not on its
   * way into one through an invitation, and it may change the table. Offline, an invitation takes
   * the page nowhere, and the offer stays.
   */
  readonly visible = computed(() => {
    this.objectChange.networkVersion();
    if (this.dismissed()) return false;
    if (!this.roomSnapshot.isSupported) return false;
    if (this.latest() === null) return false;
    if (!this.localModePreference.enabled() && parseInviteLink(location.hash) !== null) return false;
    if (Network.peerContext?.roomName) return false;
    return this.rolePermission.canEditTabletop;
  });

  /** Takes the offer down, as when it is turned down or the table is restored. */
  dismiss(): void {
    this.dismissed.set(true);
  }
}
