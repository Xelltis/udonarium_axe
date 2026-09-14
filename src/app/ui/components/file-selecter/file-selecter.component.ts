import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { emitSelectFile } from '@axe/core/event/domain-events';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { canBrowseImage, ImageTag } from '@axe/domain/media/image-tag';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'file-selector',
  templateUrl: './file-selecter.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class FileSelecterComponent {
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  isAllowedEmpty: boolean = false;

  private get allTag(): string {
    return this.t('ui.fileSelecter.tagAll');
  }

  /**
   * A picture the master is keeping back is not offered to anyone else. Nothing here hides
   * one already standing on the table: this is about what may be picked, not what is seen.
   */
  private mayShow(imageFile: ImageFile): boolean {
    return canBrowseImage(ImageTag.get(imageFile.context.identifier) ?? null, this.rolePermission.canSeeHidden);
  }

  /**
   * Every stored image the local user may pick, whatever its tag.
   *
   * Pictures the game master has kept back are left out for everyone else.
   */
  getAllImage(): ImageFile[] {
    return this.fileStorageService.images.filter((imageFile) => this.mayShow(imageFile));
  }

  readonly images = computed(() => {
    this.objectChange.fileVersion();
    const imageFileList: ImageFile[] = [];
    if (this.selectTag() == this.allTag) return this.getAllImage();

    for (const imageFile of this.fileStorageService.images) {
      const identifier = imageFile.context.identifier;

      if (ImageTag.get(identifier)) {
        const tag: string = ImageTag.get(identifier).tag;
        if (this.selectTag() == tag && this.mayShow(imageFile)) {
          imageFileList.push(imageFile);
        }
      } else {
        if (this.selectTag() == '') {
          imageFileList.push(imageFile);
        }
      }
    }

    return imageFileList;
  });

  selectedFile: ImageFile | null = null;
  /** Whether `selectedFile` holds an image; nothing in this picker sets it, so false unless a caller does. */
  get isSelected(): boolean {
    return this.selectedFile !== null;
  }
  /**
   * The tag record of the chosen image, or null with nothing chosen.
   *
   * An image without one is given a new tag record, which is shared with the room.
   */
  get selectedImageTag(): ImageTag | null {
    if (!this.isSelected || this.selectedFile === null) return null;
    const imageTag = ImageTag.get(this.selectedFile.identifier);
    return imageTag ? imageTag : ImageTag.create(this.selectedFile.identifier);
  }

  /**
   * The tags offered as filters above the pictures: untagged first, then all, then each tag
   * that has at least one picture the local user may pick.
   */
  get tagList(): string[] {
    const tags: string[] = [];
    for (const imageFile of this.fileStorageService.images) {
      // A tag whose pictures are every one of them kept back is not offered either: picking
      // it would open on nothing, and its name says there is something there to find.
      if (!this.mayShow(imageFile)) continue;
      const imageTag = ImageTag.get(imageFile.context.identifier);
      if (imageTag?.tag) tags.push(imageTag.tag);
    }

    const tags2: string[] = Array.from(new Set(tags));
    tags2.unshift(this.allTag);
    tags2.unshift('');
    return tags2;
  }

  readonly selectTag = signal('');
  fileStorageService = this.imageStorage;

  identifierList: string[] = [];
  newTagName: string = '';

  /** Called when a tag filter is chosen; does nothing. */
  resetBtn() {}

  /**
   * Adds an image to, or removes it from, the list of checked identifiers.
   *
   * An image without a tag record is given one first, which is shared with the room.
   */
  onChange(fileName: string, checked: boolean) {
    const imageTag = ImageTag.get(fileName);
    if (!imageTag) ImageTag.create(fileName);

    if (checked) {
      if (!this.identifierList.includes(fileName)) {
        this.identifierList.push(fileName);
      }
    } else {
      const index = this.identifierList.indexOf(fileName);
      if (index >= 0) {
        this.identifierList.splice(index, 1);
      }
    }
  }

  /** The empty image, offered as the "no image" choice when the caller allows one. */
  get empty(): ImageFile {
    return ImageFile.Empty;
  }

  constructor() {
    const option = this.modalService.option as Record<string, unknown>;
    this.isAllowedEmpty = !!option?.isAllowedEmpty;
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('ui.fileSelecter.panelTitle')));
  }

  /**
   * Called when a picture, or the "no image" choice, is clicked: announces the choice and
   * closes the modal with the image's identifier as its result.
   */
  onSelectedFile(file: ImageFile) {
    emitSelectFile({ fileIdentifier: file.identifier });
    this.modalService.resolve(file.identifier);
  }
}
