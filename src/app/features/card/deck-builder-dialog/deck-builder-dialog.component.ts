import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
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

  readonly selectedTag = signal('');
  readonly useImageName = signal(true);

  readonly tags = computed(() => {
    const tags = new Set<string>();
    for (const image of this.imageStorage.images) {
      const imageTag = ImageTag.get(image.identifier) ?? null;
      if (!canBrowseImage(imageTag, this.rolePermission.canSeeHidden)) continue;
      const tag = imageTag?.tag ?? '';
      if (tag.length > 0 && tag !== SYSTEM_RESERVED_TAG) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  });

  readonly cardCount = computed(() => this.imagesOf(this.selectedTag()).length);

  /**
   * The pictures filed under a tag that this seat may browse, which become the cards; an empty tag
   * gives none.
   */
  imagesOf(tag: string): { identifier: string }[] {
    if (tag.length < 1) return [];
    return this.imageStorage.images.filter(
      (image) =>
        (ImageTag.get(image.identifier)?.tag ?? '') === tag &&
        canBrowseImage(ImageTag.get(image.identifier) ?? null, this.rolePermission.canSeeHidden)
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
