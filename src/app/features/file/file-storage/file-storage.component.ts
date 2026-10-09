import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { emitSelectFile } from '@axe/core/event/domain-events';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import * as MimeType from '@axe/core/storage/mime-type';
import { canBrowseImage, ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { ImageIntakeComponent } from '@axe/features/file/image-intake/image-intake.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const ALL_TAG = '__all__';

@Component({
  selector: 'file-storage',
  templateUrl: './file-storage.component.html',
  host: { class: 'block outline-none', tabindex: '-1', '(paste)': 'onPaste($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class FileStorageComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly panelService = inject(PanelService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  /** The label shown for a tag in the tag filter, with the all and untagged entries translated. */
  displayTagName(tag: string): string {
    if (tag === ALL_TAG) return this.t('feature.file.fileStorage.all');
    if (!tag) return this.t('feature.file.fileStorage.unset');
    return tag;
  }

  protected checkedFiles = new Set<string>();

  /** Only the master may keep a picture back, or see one that is being kept. */
  get canKeepSecret(): boolean {
    return this.rolePermission.canSeeHidden;
  }

  /** The master's own view of what is being kept. Everyone else never sees them at all. */
  readonly showSecret = signal(true);

  private mayShow(imageFile: ImageFile): boolean {
    return canBrowseImage(ImageTag.get(imageFile.context.identifier) ?? null, this.canKeepSecret, this.showSecret());
  }

  /**
   * Every stored picture this seat may see whatever its tag, following the master's switch for
   * showing kept-back pictures.
   */
  getAllImage(): ImageFile[] {
    return this.fileStorageService.images.filter((imageFile) => this.mayShow(imageFile));
  }

  readonly images = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('image-tag')();
    const imageFileList: ImageFile[] = [];
    if (this.selectTag() == ALL_TAG) return this.getAllImage();
    for (const imageFile of this.fileStorageService.images) {
      const identifier = imageFile.context.identifier;
      const imageTag = ImageTag.get(identifier);

      if (imageTag) {
        this.objectChange.versionOf(imageTag.identifier)();
        const tag: string = imageTag.tag;
        if (tag == this.selectTag() && this.mayShow(imageFile)) {
          imageFileList.push(imageFile);
        }
      } else if (this.selectTag() == '') {
        imageFileList.push(imageFile);
      }
    }
    return imageFileList;
  });

  selectedFile: ImageFile | null = null;
  /** Whether a picture has been selected. */
  get isSelected(): boolean {
    return this.selectedFile !== null;
  }
  /**
   * The tag record of the selected picture, or null with nothing selected.
   *
   * A picture without one gets a new tag record on the spot, which is shared with the room.
   */
  get selectedImageTag(): ImageTag | null {
    if (!this.isSelected || this.selectedFile === null) return null;
    const imageTag = ImageTag.get(this.selectedFile.identifier);
    return imageTag ? imageTag : ImageTag.create(this.selectedFile.identifier);
  }

  readonly tagList = computed<string[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('image-tag')();
    const tags: string[] = [];
    for (const imageFile of this.fileStorageService.images) {
      const identifier = imageFile.context.identifier;
      const imageTag = ImageTag.get(identifier);
      if (imageTag) {
        this.objectChange.versionOf(imageTag.identifier)();
        if (imageTag.tag && imageTag.tag != SYSTEM_RESERVED_TAG) tags.push(imageTag.tag);
      }
    }

    const tags2: string[] = Array.from(new Set(tags));
    tags2.unshift(ALL_TAG);
    tags2.unshift('');
    return tags2;
  });

  fileStorageService = this.imageStorage;

  /** Keeps the tag name typed into the new-tag field. */
  onInputNewTag(event: Event): void {
    this.newTagName.set((event.target as HTMLInputElement).value);
  }

  /**
   * Files every ticked picture in the current list under the typed tag.
   *
   * Typing the untagged label clears their tag instead. The names reserved for all pictures and for
   * the tool's own pictures are refused. Tag records are shared, so the change reaches every peer.
   */
  changeTag() {
    const candidate = this.newTagName();
    if (candidate === ALL_TAG) return;
    if (candidate === SYSTEM_RESERVED_TAG) return;
    if (candidate === this.t('feature.file.fileStorage.all')) return;

    const changeableImages = this.images();

    for (const img of changeableImages) {
      if (this.checkedFiles.has(img.context.identifier)) {
        let imageTag = ImageTag.get(img.context.identifier);
        imageTag = imageTag ? imageTag : ImageTag.create(img.context.identifier);
        if (candidate === this.t('feature.file.fileStorage.unset')) {
          imageTag.tag = '';
        } else {
          imageTag.tag = candidate;
        }
      }
    }
  }

  /** Whether the picture is being kept back by the master. */
  isSecret(file: ImageFile): boolean {
    return ImageTag.isSecret(file.context.identifier);
  }

  /** Keeps back, or gives up, every picture ticked. Only the master may. */
  setCheckedSecret(secret: boolean): void {
    if (!this.canKeepSecret) return;

    for (const image of this.images()) {
      const identifier = image.context.identifier;
      if (!this.checkedFiles.has(identifier)) continue;
      const tag = ImageTag.get(identifier) ?? ImageTag.create(identifier);
      // What the tool brought with it is nobody's to keep or to give up.
      if (tag.tag === SYSTEM_RESERVED_TAG) continue;
      tag.isSecret = secret;
    }
  }

  readonly selectTag = signal('');
  readonly newTagName = signal<string>('');

  /** Runs when the tag filter changes; it does nothing. */
  resetBtn() {}

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('common.panel.fileStorage')));
  }

  /**
   * Loads the files chosen in the upload dialog into storage, then clears the input so the same
   * file can be chosen again.
   *
   * A seat that may not edit the table loads nothing.
   */
  handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!this.rolePermission.canEditTabletop) {
      input.value = '';
      return;
    }
    const files = input.files;
    if (files && files.length) this.fileArchiver.load(files);
    input.value = '';
  }

  /** What the panel has to say about the last paste or clearing asked for, empty when nothing. */
  readonly notice = signal('');

  /**
   * Opens the picture on the clipboard to be looked at and added, from the paste button.
   *
   * Where the browser will not hand the clipboard over, or it holds no picture, the panel says so,
   * and how to paste with the keys instead.
   */
  async pasteFromClipboard(): Promise<void> {
    if (!this.rolePermission.canEditTabletop) return;
    this.notice.set('');
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((each) => each.startsWith('image/'));
        if (!type) continue;
        this.openIntake(await item.getType(type), pastedImageName(type));
        return;
      }
      this.notice.set(this.t('feature.file.fileStorage.pasteNothing'));
    } catch {
      this.notice.set(this.t('feature.file.fileStorage.pasteWithKeys'));
    }
  }

  /**
   * Opens a picture pasted with the keys while the panel has the focus. Anything else pasted, as
   * text into the tag field, is left to go where it was going.
   */
  onPaste(event: ClipboardEvent): void {
    const image = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith('image/'));
    if (!image || !this.rolePermission.canEditTabletop) return;
    event.preventDefault();
    this.notice.set('');
    this.openIntake(image, pastedImageName(image.type));
  }

  /** The one picture ticked, which the background can be cleared from; null unless exactly one is. */
  checkedImage(): ImageFile | null {
    if (this.checkedFiles.size !== 1) return null;
    const [identifier] = this.checkedFiles;
    return this.images().find((image) => image.identifier === identifier) ?? null;
  }

  /** Opens the one picture ticked, to add a copy of it with its background cleared. */
  async clearBackgroundOfChecked(): Promise<void> {
    const image = this.checkedImage();
    if (!image || !this.rolePermission.canEditTabletop) return;
    this.notice.set('');
    try {
      const blob = image.blob ?? (await (await fetch(image.url)).blob());
      this.openIntake(blob, clearedImageName(image.name));
    } catch {
      this.notice.set(this.t('feature.file.imageIntake.failed'));
    }
  }

  private openIntake(blob: Blob, name: string): void {
    const intake = this.panelService.open(ImageIntakeComponent, {
      title: this.t('feature.file.imageIntake.title'),
      width: 480,
      height: 520,
    });
    void intake.open(blob, name);
  }

  /** Selects a picture and announces it as the chosen file to anything waiting for one. */
  onSelectedFile(file: ImageFile) {
    emitSelectFile({ fileIdentifier: file.identifier });

    this.selectedFile = file;
  }

  /** Ticks or unticks a picture for the bulk tag and keep-back actions. */
  imgBlockClick(identifier: string) {
    if (this.checkedFiles.has(identifier)) {
      this.checkedFiles.delete(identifier);
    } else {
      this.checkedFiles.add(identifier);
    }
  }
}

/** The name a pasted picture is stored under, by when it was pasted, as the clipboard gives none. */
function pastedImageName(type: string, at = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `pasted-${stamp}.${MimeType.extension(type)}`;
}

/** The name the copy of a picture with its background cleared is stored under. */
function clearedImageName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base.length > 0 ? base : 'image'}-clear.png`;
}
