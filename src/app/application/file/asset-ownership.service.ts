import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { loadOrCreateOwnerKey } from '@axe/core/storage/owner-key-storage';
import { ASSET_OWNER_ALIAS, AssetOwner } from '@axe/domain/media/asset-owner';
import { AssetRemovalKind } from '@axe/domain/media/asset-removal';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * Who added the room's pictures and sounds, and whether this seat is the one.
 *
 * A seat is known by the key it holds things by. On a room server that is the account it is logged
 * in with, which the server checks every record against. Between peers it is a key this browser
 * keeps, so a player who closes the tab and comes back is still the one who added what they added;
 * peers check nothing, so it keeps out none but those who play fair, as a die kept to its owner does.
 */
@Injectable({ providedIn: 'root' })
export class AssetOwnershipService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private browserKey: string | null = null;

  /** The key this seat holds things by; empty while it has none. */
  myOwnerKey(): string {
    if (Network.transport === 'server') return PeerCursor.myUserId;
    this.browserKey ??= loadOrCreateOwnerKey() ?? PeerCursor.myUserId;
    return this.browserKey;
  }

  /** Whether this seat added the asset, as the room knows it. An asset the room knows no adder of is nobody's. */
  isMine(assetIdentifier: string): boolean {
    return AssetOwner.get(assetIdentifier)?.isHeldBy(this.myOwnerKey()) ?? false;
  }

  /** Reads who the room says added what, so that what asks follows the records as they come and change. */
  track(): void {
    this.objectChange.collectionOf(ASSET_OWNER_ALIAS)();
    for (const record of AssetOwner.all()) this.objectChange.versionOf(record.identifier)();
  }

  /**
   * Tells the room this seat added the asset, unless it already knows who did. Only bytes named by
   * their hash are claimed, the only kind that can be removed, and not a sound only linked to; a seat
   * that may only watch adds nothing to the room, and claims nothing.
   */
  claim(assetIdentifier: string, kind: AssetRemovalKind): void {
    if (!this.rolePermission.canEditTabletop() || !AssetHttpStore.isAssetId(assetIdentifier)) return;
    AssetOwner.claim(assetIdentifier, kind, this.myOwnerKey());
  }
}
