import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { AssetRemoval, AssetRemovalKind } from '@axe/domain/media/asset-removal';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { mentionsIdentifier } from '@axe/domain/media/image-reference';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { Jukebox } from '@axe/domain/media/jukebox';

/**
 * Removes pictures and sounds from the whole room, as only its GM may.
 *
 * What it removes is written into the room as an `AssetRemoval`, which every seat follows by letting
 * go of it and taking it from nobody, and, on a room server, taken out of the room's store as well.
 * What uses it is left as it is: an identifier is the hash of what it names, so the same file added
 * again shows wherever it showed before.
 */
@Injectable({ providedIn: 'root' })
export class AssetRemovalService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly storeRetries = new AssetRetries();

  /**
   * Which of these may be removed: those a person added, named by the hash of what they hold, and
   * not a picture the tool brought with it.
   */
  removable(kind: AssetRemovalKind, identifiers: readonly string[]): string[] {
    return [...new Set(identifiers)].filter(
      (identifier) =>
        AssetHttpStore.isAssetId(identifier) &&
        (kind === 'audio' || ImageTag.get(identifier)?.tag !== SYSTEM_RESERVED_TAG)
    );
  }

  /**
   * How many things in the room use any of these: pieces, tables, cut-ins, the room's music and the
   * like. The tags and removals of pictures and sounds do not count, nor does what was said in chat.
   */
  countUses(identifiers: readonly string[]): number {
    if (identifiers.length === 0) return 0;
    return this.objectStore
      .getObjects()
      .filter((object) => this.counts(object))
      .filter((object) => {
        const data = object.toContext().syncData;
        return identifiers.some((identifier) => mentionsIdentifier(data, identifier));
      }).length;
  }

  /**
   * Removes them from the room, and gives back how many were. Nothing is removed for anyone but the
   * GM. Sounds the room is playing are stopped first, so that nothing it plays names one gone.
   */
  remove(kind: AssetRemovalKind, identifiers: readonly string[]): number {
    if (!this.rolePermission.canEditShared) return 0;
    const targets = this.removable(kind, identifiers);
    if (targets.length === 0) return 0;
    GameObject.batch(() => {
      if (kind === 'audio') this.stopPlaying(targets);
      for (const identifier of targets) AssetRemoval.remove(identifier, kind);
    });
    for (const identifier of targets) this.takeOutOfStore(identifier);
    return targets.length;
  }

  private counts(object: GameObject): boolean {
    return !(
      object instanceof ImageTag ||
      object instanceof AudioTag ||
      object instanceof AssetRemoval ||
      object instanceof ChatMessage ||
      object instanceof ChatReaction
    );
  }

  private stopPlaying(identifiers: readonly string[]): void {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    if (jukebox && identifiers.includes(jukebox.audioIdentifier)) jukebox.stop();
    for (const identifier of identifiers) {
      const sound = BackgroundSound.of(identifier);
      if (sound?.isOn) sound.stop();
    }
  }

  /**
   * Asks the room server to take it out of the room's store, again a few times when it could not
   * be asked just then. Left there, it is still fetched by nobody, each seat following the removal.
   */
  private takeOutOfStore(identifier: string): void {
    if (Network.transport !== 'server' || !AssetHttpStore.instance.isEnabled) return;
    void AssetHttpStore.instance.remove(identifier).then((result) => {
      if (result !== 'failed') {
        this.storeRetries.forget(identifier);
        return;
      }
      this.storeRetries.schedule(identifier, () => this.takeOutOfStore(identifier));
    });
  }
}
