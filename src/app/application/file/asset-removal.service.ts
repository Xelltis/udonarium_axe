import { inject, Injectable } from '@angular/core';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { ASSET_LAST_TRY_DELAY_MS, AssetRetries } from '@axe/core/storage/asset-retries';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { AssetRemoval, AssetRemovalKind } from '@axe/domain/media/asset-removal';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { mentionsAnyOf } from '@axe/domain/media/image-reference';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { Jukebox } from '@axe/domain/media/jukebox';

/** The words for asking and telling, for each kind removed. */
const WORDS: Readonly<Record<AssetRemovalKind, { title: string; confirm: string; removed: string }>> = {
  image: {
    title: 'feature.file.removal.imageTitle',
    confirm: 'feature.file.removal.imageConfirm',
    removed: 'feature.file.removal.imageRemoved',
  },
  audio: {
    title: 'feature.file.removal.audioTitle',
    confirm: 'feature.file.removal.audioConfirm',
    removed: 'feature.file.removal.audioRemoved',
  },
};

/**
 * Removes pictures and sounds from the whole room, as its GM may any of them and a player those they
 * added themselves.
 *
 * What it removes is written into the room as an `AssetRemoval`, which every seat follows by letting
 * go of it and taking it from nobody, and, on a room server, taken out of the room's store as well.
 * What uses it is left as it is: an identifier is the hash of what it names, so the same file added
 * again shows wherever it showed before.
 */
@Injectable({ providedIn: 'root' })
export class AssetRemovalService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly ownership = inject(AssetOwnershipService);
  private readonly objectStore = inject(ObjectStore);
  private readonly confirm = inject(ConfirmService);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly assetHttpStore = inject(AssetHttpStore);
  private readonly storeRetries = new AssetRetries();

  /**
   * Which of these this seat may remove: those a person added, named by the hash of what they hold,
   * and not a picture the tool brought with it; and of those, for anyone but the GM, the ones this seat
   * added itself.
   */
  removable(kind: AssetRemovalKind, identifiers: readonly string[]): string[] {
    return this.removableByAnyone(kind, identifiers).filter((identifier) => this.mayRemove(identifier));
  }

  /** Whether this seat may remove the asset: the GM any, a player one they added, and one watching none. */
  mayRemove(identifier: string): boolean {
    if (this.rolePermission.canEditShared()) return true;
    return this.rolePermission.canEditTabletop() && this.ownership.isMine(identifier);
  }

  /** Which of these anyone at all may remove, the GM if nobody else: whatever the room did not bring itself. */
  private removableByAnyone(kind: AssetRemovalKind, identifiers: readonly string[]): string[] {
    return [...new Set(identifiers)].filter(
      (identifier) =>
        AssetHttpStore.isAssetId(identifier) &&
        (kind === 'audio' || ImageTag.get(identifier)?.tag !== SYSTEM_RESERVED_TAG)
    );
  }

  /**
   * How many things in the room use any of these: pieces, tables, cut-ins, the room's music and the
   * like. The tags, removals and adders of pictures and sounds do not count, nor does what was said in chat,
   * nor a background sound that is off, which keeps the sound it last played.
   */
  countUses(identifiers: readonly string[]): number {
    if (identifiers.length === 0) return 0;
    return this.objectStore
      .getObjects()
      .filter((object) => this.counts(object) && mentionsAnyOf(object.readSyncData(), identifiers)).length;
  }

  /**
   * Removes them from the room, those this seat may, and gives back how many were. What the room is
   * playing of the sounds, as music, a background sound or the cut-in shown, is stopped first, so that
   * nothing it plays names one gone. The room's store is asked once more a while later, for bytes a
   * player's upload under way put there after them.
   */
  remove(kind: AssetRemovalKind, identifiers: readonly string[]): number {
    const targets = this.removable(kind, identifiers);
    if (targets.length === 0) return 0;
    GameObject.batch(() => {
      if (kind === 'audio') this.stopPlaying(targets);
      for (const identifier of targets) AssetRemoval.remove(identifier, kind);
    });
    const roomKey = Network.roomKey;
    for (const identifier of targets) this.takeOutOfStore(identifier, roomKey);
    setTimeout(() => {
      for (const identifier of targets) this.takeOutOfStore(identifier, roomKey);
    }, ASSET_LAST_TRY_DELAY_MS);
    return targets.length;
  }

  /**
   * Puts back for the room one it removed, as the GM alone may, and says whether it was. A removal
   * the GM made is not undone by anyone else adding the same file.
   */
  putBack(identifier: string): boolean {
    if (!this.rolePermission.canEditShared()) return false;
    AssetRemoval.restore(identifier);
    return true;
  }

  /**
   * Takes out of the room's store those of these the room keeps removed and this seat may remove: found
   * there after all, as when an upload under way when they were removed reached it later, or a seat of
   * an older version put them up again.
   */
  takeOut(identifiers: readonly string[]): void {
    for (const identifier of identifiers) {
      if (this.mayRemove(identifier)) this.takeOutOfStore(identifier, Network.roomKey);
    }
  }

  /**
   * Asks first, saying how many things use them, how many chosen are someone else's to remove and how
   * to bring them back, then removes them and says how many went. Gives back how many were removed.
   * Chosen ones none of which this seat may remove are said to be so.
   */
  async removeAfterAsking(kind: AssetRemovalKind, identifiers: readonly string[]): Promise<number> {
    if (!this.rolePermission.canEditTabletop()) return 0;
    const anyones = this.removableByAnyone(kind, identifiers);
    const targets = anyones.filter((identifier) => this.mayRemove(identifier));
    if (targets.length === 0) {
      if (identifiers.length > 0) {
        const why = anyones.length > 0 ? 'feature.file.removal.notYours' : 'feature.file.removal.notRemovable';
        this.snackbar.show(this.t(why));
      }
      return 0;
    }
    const words = WORDS[kind];
    const uses = this.countUses(targets);
    const kept = anyones.length - targets.length;
    const message = [
      this.t(words.confirm, { count: targets.length }),
      ...(kept > 0 ? [this.t('feature.file.removal.othersKept', { count: kept })] : []),
      ...(uses > 0 ? [this.t('feature.file.removal.uses', { uses })] : []),
      this.t('feature.file.removal.restore'),
    ].join('\n');
    const sure = await this.confirm.ask({
      title: this.t(words.title),
      message,
      okLabel: this.t('feature.file.removal.ok'),
      danger: true,
    });
    if (!sure) return 0;
    const removed = this.remove(kind, targets);
    if (removed > 0) this.snackbar.show(this.t(words.removed, { count: removed }));
    return removed;
  }

  private counts(object: GameObject): boolean {
    return !(
      (object instanceof BackgroundSound && !object.isOn) ||
      object instanceof ImageTag ||
      object instanceof AudioTag ||
      object instanceof AssetRemoval ||
      object instanceof AssetOwner ||
      object instanceof ChatMessage ||
      object instanceof ChatReaction
    );
  }

  /**
   * Puts the bytes up again when the room put them back while the store was taking them out, as the
   * GM adding the file again finds them still there and sends nothing.
   */
  private putUpIfPutBack(identifier: string): void {
    const record = AssetRemoval.get(identifier);
    if (!record || record.isRemoved) return;
    if (record.kind === 'audio') this.audioStorage.putUpAgain(identifier);
    else this.imageStorage.putUpAgain(identifier);
  }

  private stopPlaying(identifiers: readonly string[]): void {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    if (jukebox && identifiers.includes(jukebox.audioIdentifier)) jukebox.stop();
    for (const identifier of identifiers) {
      const sound = BackgroundSound.of(identifier);
      if (sound?.isOn) sound.stop();
    }
    const launcher = this.objectStore.get<CutInLauncher>('CutInLauncher');
    const shown = launcher?.launchIsStart ? this.objectStore.get(launcher.launchCutInIdentifier) : null;
    if (launcher && shown instanceof CutIn && identifiers.includes(shown.audioIdentifier)) launcher.stopCutIn(shown);
  }

  /**
   * Asks the room server to take it out of the store of the room it was removed in, again a few times
   * when it could not be asked just then, while the seat is still in that room and the room still keeps
   * it removed. Left there, it is still fetched by nobody, each seat following the removal; the next
   * removal or reading of the room's list asks afresh.
   */
  private takeOutOfStore(identifier: string, roomKey: string | null): void {
    if (Network.transport !== 'server' || !this.assetHttpStore.isEnabled) return;
    if (Network.roomKey !== roomKey || !AssetRemoval.get(identifier)?.isRemoved) {
      this.storeRetries.forget(identifier);
      return;
    }
    void this.assetHttpStore.remove(identifier).then((result) => {
      if (result !== 'failed') {
        this.storeRetries.forget(identifier);
        if (result === 'removed') this.putUpIfPutBack(identifier);
        return;
      }
      if (!this.storeRetries.schedule(identifier, () => this.takeOutOfStore(identifier, roomKey))) {
        this.storeRetries.forget(identifier);
      }
    });
  }
}
