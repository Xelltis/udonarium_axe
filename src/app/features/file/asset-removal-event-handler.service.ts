import { DestroyRef, inject, Injectable } from '@angular/core';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetRemoval } from '@axe/domain/media/asset-removal';

/** The kind the records go by, as the object store names it. */
const ALIAS = 'asset-removal';

/**
 * Keeps this seat in step with what the room removed: a picture or sound the room keeps removed is
 * let go of here and taken from nobody, and one put back may come again. It follows every record as
 * it comes, changes or goes, the last as when the seat goes into another room.
 *
 * A picture or sound the GM chooses to add again, one the room had removed, puts it back for the
 * room: the same file is the same identifier, so whatever showed it shows it again. Anyone else is
 * told that only the GM may. Bytes that reach the room's store after their removal all the same are
 * taken out again by the GM.
 */
@Injectable({ providedIn: 'root' })
export class AssetRemovalEventHandlerService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly assetRemoval = inject(AssetRemovalService);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);
  /** The asset each record keeps removed here now, by the record's identifier. */
  private readonly marked = new Map<string, string>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    const follow = (event: { identifier: string; aliasName: string }) => {
      if (event.aliasName === ALIAS) this.follow(event.identifier);
    };
    this.objectChange.objectAdded$.subscribe(follow, destroyRef);
    this.objectChange.objectRemoved$.subscribe(follow, destroyRef);
    this.objectChange.onObjectChangedForAlias([ALIAS], follow, destroyRef);
    for (const [storage, refused] of [
      [ImageStorage.instance, 'feature.file.removal.imageRefused'],
      [AudioStorage.instance, 'feature.file.removal.audioRefused'],
    ] as const) {
      storage.putBack = (identifier) => this.assetRemoval.putBack(identifier);
      storage.onRefused = () => this.snackbar.show(this.t(refused));
      storage.onUploadedWhileRemoved = (identifier) => this.assetRemoval.takeOut([identifier]);
    }
    destroyRef.onDestroy(() => {
      for (const storage of [ImageStorage.instance, AudioStorage.instance]) {
        storage.putBack = () => false;
        storage.onRefused = () => {};
        storage.onUploadedWhileRemoved = () => {};
      }
    });
    for (const record of AssetRemoval.all()) this.follow(record.identifier);
  }

  /** Brings this seat in step with one record, as it stands or gone from the room. */
  private follow(recordIdentifier: string): void {
    const found = ObjectStore.instance.get(recordIdentifier);
    const removing = found instanceof AssetRemoval && found.isRemoved ? found : null;
    const was = this.marked.get(recordIdentifier);
    if (was === removing?.assetIdentifier) return;
    if (was !== undefined) {
      ImageStorage.instance.unmarkRemoved(was);
      AudioStorage.instance.unmarkRemoved(was);
      this.marked.delete(recordIdentifier);
    }
    if (!removing) return;
    if (removing.kind === 'audio') AudioStorage.instance.markRemoved(removing.assetIdentifier);
    else ImageStorage.instance.markRemoved(removing.assetIdentifier);
    this.marked.set(recordIdentifier, removing.assetIdentifier);
  }
}
