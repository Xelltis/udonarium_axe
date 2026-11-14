import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { trackEvery } from '@axe/application/sync/track-every';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { canBrowseImage, ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { TranslocoModule } from '@jsverse/transloco';

export interface DeckBuilderResult {
  tag: string;
  useImageName: boolean;
}

@Component({
  selector: 'deck-builder-dialog',
  templateUrl: './deck-builder-dialog.component.html',
  host: { class: 'text-ui-text block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class DeckBuilderDialogComponent {
  private readonly modalService = inject(ModalService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly objectChange = inject(ObjectChangeService);

  readonly selectedTag = signal('');
  readonly useImageName = signal(true);

  readonly tags = computed(() => {
    this.followPictures();
    const tags = new Set<string>();
    for (const image of this.imageStorage.images) {
      const imageTag = ImageTag.get(image.identifier) ?? null;
      if (!canBrowseImage(imageTag, this.rolePermission.canSeeHidden(), true, this.tagLock.hides)) continue;
      const tag = imageTag?.tag ?? '';
      if (tag.length > 0 && tag !== SYSTEM_RESERVED_TAG) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  });

  readonly cardCount = computed(() => {
    this.followPictures();
    return this.imagesOf(this.selectedTag()).length;
  });

  /**
   * Follows what the tags and the count are made from, read inside a computed: the pictures there
   * are, the tag of each, a tag's word changed at another seat among them, and the tags locked.
   */
  private followPictures(): void {
    this.objectChange.fileVersion();
    trackEvery(this.objectChange, 'image-tag');
    this.tagLock.track();
  }

  /**
   * The pictures filed under a tag that this seat may browse, which become the cards; an empty tag
   * gives none.
   */
  imagesOf(tag: string): { identifier: string }[] {
    if (tag.length < 1) return [];
    return this.imageStorage.images.filter(
      (image) =>
        (ImageTag.get(image.identifier)?.tag ?? '') === tag &&
        canBrowseImage(
          ImageTag.get(image.identifier) ?? null,
          this.rolePermission.canSeeHidden(),
          true,
          this.tagLock.hides
        )
    );
  }

  /**
   * Closes the dialog with the chosen tag and whether each card takes its picture's name.
   *
   * A tag with no pictures in it closes the dialog as if it were cancelled, so no empty deck is
   * made.
   */
  confirm(): void {
    if (this.cardCount() < 1) {
      this.modalService.resolve(null);
      return;
    }
    this.modalService.resolve({ tag: this.selectedTag(), useImageName: this.useImageName() });
  }

  /** Closes the dialog without building a deck. */
  cancel(): void {
    this.modalService.resolve(null);
  }
}
