import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { ImageUploadPreferenceService } from '@axe/application/file/image-upload-preference.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ReportService } from '@axe/application/moderation/report.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { emitSelectFile } from '@axe/core/event/domain-events';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import * as MimeType from '@axe/core/storage/mime-type';
import { canBrowseImage, ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { isAccountAvatar } from '@axe/domain/peer/account-avatar';
import { ReportDialogComponent } from '@axe/features/moderation/report-dialog/report-dialog.component';
import { ImageEditQueue } from '@axe/ui/components/image-editor/image-edit-queue.service';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const ALL_TAG = '__all__';

@Component({
  selector: 'file-storage',
  templateUrl: './file-storage.component.html',
  host: { class: 'block outline-none', tabindex: '-1', '(paste)': 'onPaste($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextTooltipDirective, FormsModule, SafePipe, TranslocoModule],
})
export class FileStorageComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly panelService = inject(PanelService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly editQueue = inject(ImageEditQueue);
  private readonly assetRemoval = inject(AssetRemovalService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly snackbar = inject(SnackbarService);
  private readonly ownership = inject(AssetOwnershipService);
  private readonly reports = inject(ReportService);
  private readonly modalService = inject(ModalService);

  /** Whether this seat may report a picture to the room server's operator, as anyone in its room may. */
  protected readonly canReport = this.reports.canReport;
  protected readonly uploadPreference = inject(ImageUploadPreferenceService);

  /** The label shown for a tag in the tag filter, with the all and untagged entries translated. */
  displayTagName(tag: string): string {
    if (tag === ALL_TAG) return this.t('feature.file.fileStorage.all');
    if (!tag) return this.t('feature.file.fileStorage.unset');
    return tag;
  }

  /** The pictures ticked, by identifier. */
  protected readonly checkedFiles = signal<ReadonlySet<string>>(new Set());

  /** Only the master may keep a picture back, or see one that is being kept. */
  get canKeepSecret(): boolean {
    return this.rolePermission.canSeeHidden();
  }

  /**
   * Whether this seat may bring pictures in, edit them and file them under tags, which a guest may
   * not. It follows this seat's cursor, so the panel redraws when the role changes.
   */
  protected readonly canEdit = computed(() => this.rolePermission.canEditTabletop());

  /**
   * Whether this seat may remove pictures from the room here: the master always, and a player while
   * any picture listed is one they added. It follows this seat's cursor, as `canEdit` does, and who
   * the room says added what.
   */
  protected readonly canRemove = computed(() => {
    this.objectChange.trackMyCursor();
    this.ownership.track();
    if (this.rolePermission.canEditShared()) return true;
    return this.images().some((image) => this.assetRemoval.mayRemove(image.context.identifier));
  });

  /** The master's own view of what is being kept. Everyone else never sees them at all. */
  readonly showSecret = signal(true);

  /**
   * Whether a picture is listed for this seat: one it may browse, and no account's avatar, which is
   * no picture of the room's.
   */
  private mayShow(imageFile: ImageFile): boolean {
    if (isAccountAvatar(imageFile.context.identifier)) return false;
    const tag = ImageTag.get(imageFile.context.identifier) ?? null;
    return canBrowseImage(tag, this.canKeepSecret, this.showSecret(), this.tagLock.hides);
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
    this.tagLock.track();
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
      } else if (this.selectTag() == '' && this.mayShow(imageFile)) {
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

  /**
   * The tags offered above the pictures: untagged first, then all, then each tag a person filed
   * pictures under, but those someone else keeps from this seat.
   */
  readonly tagList = computed<string[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('image-tag')();
    this.objectChange.trackMyCursor();
    this.tagLock.track();
    const tags: string[] = [];
    for (const imageFile of this.fileStorageService.images) {
      const identifier = imageFile.context.identifier;
      const imageTag = ImageTag.get(identifier);
      if (imageTag) {
        this.objectChange.versionOf(imageTag.identifier)();
        const tag = imageTag.tag;
        if (tag && tag != SYSTEM_RESERVED_TAG && !this.tagLock.hides(tag)) tags.push(tag);
      }
    }

    const tags2: string[] = Array.from(new Set(tags));
    tags2.unshift(ALL_TAG);
    tags2.unshift('');
    return tags2;
  });

  fileStorageService = this.imageStorage;

  /** The tags listed that someone keeps to themselves, which only their holder and the master see listed. */
  protected readonly lockedTags = computed<ReadonlySet<string>>(() => {
    this.tagLock.track();
    return new Set(this.tagList().filter((tag) => this.tagLock.isLocked(tag)));
  });

  /** Whether this seat may lock or unlock the tag picked above the pictures. */
  protected readonly canLockSelected = computed(() => {
    this.objectChange.trackMyCursor();
    this.tagLock.track();
    const tag = this.selectTag();
    return tag !== ALL_TAG && this.tagLock.mayToggle(tag);
  });

  /** Keeps the tag picked above the pictures to this seat and the master, or lets everyone see it again. */
  toggleSelectedLock(): void {
    if (this.canLockSelected()) this.tagLock.toggle(this.selectTag());
  }

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
    if (!this.rolePermission.canEditTabletop()) return;
    const candidate = this.newTagName();
    if (candidate === ALL_TAG) return;
    if (candidate === SYSTEM_RESERVED_TAG) return;
    if (candidate === this.t('feature.file.fileStorage.all')) return;
    if (!this.tagLock.mayFileUnder(candidate)) {
      this.snackbar.show(this.t('feature.file.fileStorage.tagKeptByOther'));
      return;
    }

    const changeableImages = this.images();

    for (const img of changeableImages) {
      if (this.checkedFiles().has(img.context.identifier)) {
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
      if (!this.checkedFiles().has(identifier)) continue;
      const tag = ImageTag.get(identifier) ?? ImageTag.create(identifier);
      // What the tool brought with it is nobody's to keep or to give up.
      if (tag.tag === SYSTEM_RESERVED_TAG) continue;
      tag.isSecret = secret;
    }
  }

  /**
   * Removes every picture ticked in the current list from the whole room, once the master has said
   * so, and unticks them.
   */
  /** Whether a picture is one that may be reported: one a person added, named by its hash. */
  protected isReportable(identifier: string): boolean {
    return this.reports.isReportable(identifier);
  }

  /** Asks the reader why they report a picture to the room server's operator, and sends it. */
  protected report(image: ImageFile, event: Event): void {
    event.stopPropagation();
    if (!this.canReport()) return;
    void this.modalService.open(ReportDialogComponent, {
      target: 'asset',
      assetId: image.identifier,
      name: image.name,
    });
  }

  async removeChecked(): Promise<void> {
    if (!this.canRemove()) return;
    const checked = this.images()
      .map((image) => image.context.identifier)
      .filter((identifier) => this.checkedFiles().has(identifier));
    if ((await this.assetRemoval.removeAfterAsking('image', checked)) > 0) this.checkedFiles.set(new Set());
  }

  readonly selectTag = signal('');
  readonly newTagName = signal<string>('');

  /** Runs when the tag filter changes; it does nothing. */
  resetBtn() {}

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('common.panel.fileStorage')));
  }

  /**
   * Takes in the pictures chosen in the upload dialog, through the image editor where they are set
   * to open in it first or are too large to go straight in, then clears the input so the same file
   * can be chosen again. The panel names any picture still over the size limit once the rest are in.
   *
   * A seat that may not edit the table loads nothing.
   */
  async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!this.rolePermission.canEditTabletop() || files.length === 0) return;
    this.notice.set('');
    const { oversized } = await this.editQueue.upload(files);
    if (oversized.length > 0) {
      this.notice.set(this.t('feature.file.fileStorage.oversized', { names: oversized.join(', ') }));
    }
  }

  /** What the panel has to say about the last paste or edit asked for, empty when nothing. */
  readonly notice = signal('');

  /**
   * Opens the picture on the clipboard to be looked at and added, from the paste button.
   *
   * Where the browser will not hand the clipboard over, or it holds no picture, the panel says so,
   * and how to paste with the keys instead.
   */
  async pasteFromClipboard(): Promise<void> {
    if (!this.rolePermission.canEditTabletop()) return;
    this.notice.set('');
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((each) => each.startsWith('image/'));
        if (!type) continue;
        void this.editQueue.edit({ blob: await item.getType(type), name: pastedImageName(type) });
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
    if (!image || !this.rolePermission.canEditTabletop()) return;
    event.preventDefault();
    this.notice.set('');
    void this.editQueue.edit({ blob: image, name: pastedImageName(image.type) });
  }

  /**
   * The one picture ticked among those in the list, which can be edited; null unless exactly one
   * is. A ticked picture that has left the list, as one replaced by its edit, does not count.
   */
  checkedImage(): ImageFile | null {
    const checked = this.images().filter((image) => this.checkedFiles().has(image.identifier));
    return checked.length === 1 ? checked[0] : null;
  }

  /**
   * Opens the one picture ticked in the image editor, to put the edited picture in its place,
   * wherever in the room it is shown. The tick moves to the edited picture, ready to edit again.
   */
  async editChecked(): Promise<void> {
    const image = this.checkedImage();
    if (!image || !this.rolePermission.canEditTabletop()) return;
    this.notice.set('');
    let blob: Blob;
    try {
      blob = image.blob ?? (await (await fetch(image.url)).blob());
    } catch {
      this.notice.set(this.t('ui.imageEditor.failed'));
      return;
    }
    const outcome = await this.editQueue.edit({ blob, name: image.name, replaces: image });
    if (outcome.kind !== 'added') return;
    this.checkedFiles.update((checked) => {
      const next = new Set(checked);
      next.delete(image.identifier);
      next.add(outcome.image.identifier);
      return next;
    });
  }

  /** Selects a picture and announces it as the chosen file to anything waiting for one. */
  onSelectedFile(file: ImageFile) {
    emitSelectFile({ fileIdentifier: file.identifier });

    this.selectedFile = file;
  }

  /** Ticks or unticks a picture for the bulk tag and keep-back actions. */
  imgBlockClick(identifier: string) {
    this.checkedFiles.update((checked) => {
      const next = new Set(checked);
      if (!next.delete(identifier)) next.add(identifier);
      return next;
    });
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
