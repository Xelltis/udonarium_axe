import { inject, Injectable } from '@angular/core';
import { ImageUploadPreferenceService } from '@axe/application/file/image-upload-preference.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { FileArchiver, ImageLoadResult, MAX_LOADED_IMAGE_BYTES } from '@axe/core/storage/file-archiver';
import { convertBlobToWebP } from '@axe/core/storage/image-downscale';
import { ImageFile } from '@axe/core/storage/image-file';
import { editedName } from '@axe/domain/media/image-edit';
import type {
  ImageEditorComponent,
  ImageEditOutcome,
  ImageEditRequest,
} from '@axe/ui/components/image-editor/image-editor.component';
import { Z_PANEL_OVER_MODAL } from '@axe/ui/z-layers';

const PANEL_SIZE = { width: 600, height: 680 };

/** Told of each picture that went into the room, with the file it came from. */
export type ImageAdded = (file: File, image: ImageFile) => void;

/**
 * Puts pictures through the image editor before they go into the room.
 *
 * Each picture chosen is opened in turn in the one panel. Any of them can be left out, the rest
 * can be taken as they are, and closing the panel leaves out whatever had not been added yet.
 */
@Injectable({ providedIn: 'root' })
export class ImageEditQueue {
  private readonly panelService = inject(PanelService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly preference = inject(ImageUploadPreferenceService);
  private readonly modal = inject(ModalService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Takes in pictures chosen to upload, and gives back what went into the room.
   *
   * With pictures set to open in the editor first, every one does. Otherwise those within the size
   * limit go straight in, and only those over it open in the editor afterwards, to be cut down or
   * made smaller to fit. Files that are not pictures are passed over.
   */
  async upload(files: readonly File[], added?: ImageAdded): Promise<ImageLoadResult> {
    const pictures = files.filter(isPicture);
    if (this.preference.editFirst()) return this.editAll(pictures, added);
    const fitting = pictures.filter((file) => file.size <= MAX_LOADED_IMAGE_BYTES);
    const heavy = pictures.filter((file) => file.size > MAX_LOADED_IMAGE_BYTES);
    const result = { images: [] as ImageFile[], oversized: [] as string[] };
    for (const file of fitting) this.collect(result, file, await this.fileArchiver.loadImages([file]), added);
    const edited = await this.editAll(heavy, added);
    return { images: [...result.images, ...edited.images], oversized: [...result.oversized, ...edited.oversized] };
  }

  /**
   * Opens each picture among the files in the editor in turn, and gives back what went into the
   * room. Files that are not pictures are passed over; pictures taken as they are and still over
   * the size limit are named among the oversized, as a plain upload names them.
   */
  async editAll(files: readonly File[], added?: ImageAdded): Promise<ImageLoadResult> {
    const pictures = files.filter(isPicture);
    const result = { images: [] as ImageFile[], oversized: [] as string[] };
    if (pictures.length === 0) return result;
    const editor = await this.openEditor();
    for (const [index, file] of pictures.entries()) {
      const outcome = await editor.open({
        blob: file,
        name: file.name,
        position: { index: index + 1, count: pictures.length },
      });
      if (outcome.kind === 'added') {
        this.collect(result, file, { images: [outcome.image], oversized: [] }, added);
      } else if (outcome.kind === 'restAsTheyAre') {
        for (const rest of pictures.slice(index)) this.collect(result, rest, await this.takeAsItCame(rest), added);
        break;
      } else if (outcome.kind === 'closed') {
        return result;
      }
    }
    editor.close();
    return result;
  }

  /** Opens one picture in the editor, and closes it once the picture has gone into the room. */
  async edit(request: ImageEditRequest): Promise<ImageEditOutcome> {
    const editor = await this.openEditor();
    const outcome = await editor.open(request);
    if (outcome.kind === 'added') editor.close();
    return outcome;
  }

  /**
   * Stores a picture left as it came. One over the size limit is written out again as a WebP
   * first, as the editor would, in case that brings it under.
   */
  private async takeAsItCame(file: File): Promise<ImageLoadResult> {
    if (file.size <= MAX_LOADED_IMAGE_BYTES) return this.fileArchiver.loadImages([file]);
    const converted = await convertBlobToWebP(file);
    if (converted === file || converted.size > MAX_LOADED_IMAGE_BYTES) return { images: [], oversized: [file.name] };
    return this.fileArchiver.loadImages([
      new File([converted], editedName(file.name, converted.type), { type: converted.type }),
    ]);
  }

  private collect(
    into: { images: ImageFile[]; oversized: string[] },
    file: File,
    loaded: ImageLoadResult,
    added?: ImageAdded
  ): void {
    into.images.push(...loaded.images);
    into.oversized.push(...loaded.oversized.map(() => file.name));
    for (const image of loaded.images) added?.(file, image);
  }

  /**
   * Opens the editor in the middle of the screen, no taller than the screen, and above a modal
   * when one is up, as the picture picker is. The editor is fetched the first time it is wanted,
   * so a page that never edits a picture never loads it.
   */
  private async openEditor(): Promise<ImageEditorComponent> {
    const { ImageEditorComponent } = await import('@axe/ui/components/image-editor/image-editor.component');
    const width = Math.min(PANEL_SIZE.width, window.innerWidth);
    const height = Math.min(PANEL_SIZE.height, window.innerHeight);
    return this.panelService.open(ImageEditorComponent, {
      title: this.t('ui.imageEditor.title'),
      width,
      height,
      left: Math.max(0, (window.innerWidth - width) / 2),
      top: Math.max(0, (window.innerHeight - height) / 2),
      ...(this.modal.isShow ? { layer: Z_PANEL_OVER_MODAL } : {}),
    });
  }
}

function isPicture(file: File): boolean {
  return file.type.startsWith('image/');
}
